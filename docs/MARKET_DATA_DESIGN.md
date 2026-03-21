# Market Data Backend Design

## Overview

This document details the design of the market data backend, which provides a unified interface for consuming financial market data from multiple sources. Three components are covered:

1. **Unified API** - A common abstraction layer over all data sources
2. **Simulator** - A deterministic/randomized market data generator for development and testing
3. **Massive API** - Integration with the Massive financial data provider

The backend is implemented in Python with FastAPI and fits within the existing Docker/FastAPI project structure.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              FastAPI Routes                  │
│   /market/quote  /market/history  /market/ws │
└────────────────────┬────────────────────────┘
                     │
         ┌───────────▼──────────┐
         │   MarketDataService  │  (orchestrator + cache)
         └───────────┬──────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
┌───────▼──┐  ┌──────▼───┐  ┌───▼──────────┐
│Simulator │  │Massive   │  │ Future       │
│Provider  │  │Provider  │  │ Providers... │
└──────────┘  └──────────┘  └──────────────┘
```

Each provider implements the same `MarketDataProvider` abstract interface, so the service layer is decoupled from any specific data source. The active provider is selected via environment variable.

---

## Data Models

```python
# backend/market/models.py

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class AssetType(str, Enum):
    STOCK = "stock"
    ETF = "etf"
    CRYPTO = "crypto"
    FUTURE = "future"
    FOREX = "forex"


@dataclass
class Quote:
    symbol: str
    asset_type: AssetType
    bid: float
    ask: float
    last: float
    volume: int
    timestamp: datetime

    @property
    def mid(self) -> float:
        return (self.bid + self.ask) / 2

    @property
    def spread(self) -> float:
        return self.ask - self.bid


@dataclass
class OHLCV:
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class OrderBookLevel:
    price: float
    size: int


@dataclass
class OrderBook:
    symbol: str
    timestamp: datetime
    bids: list[OrderBookLevel]   # sorted descending by price
    asks: list[OrderBookLevel]   # sorted ascending by price

    @property
    def best_bid(self) -> Optional[OrderBookLevel]:
        return self.bids[0] if self.bids else None

    @property
    def best_ask(self) -> Optional[OrderBookLevel]:
        return self.asks[0] if self.asks else None


@dataclass
class SubscriptionTick:
    """Streamed over WebSocket for real-time feeds."""
    symbol: str
    price: float
    volume: int
    timestamp: datetime
    event: str = "tick"  # "tick" | "trade" | "quote"
```

---

## Unified Provider Interface

```python
# backend/market/provider.py

from abc import ABC, abstractmethod
from datetime import datetime
from typing import AsyncIterator

from .models import AssetType, OHLCV, OrderBook, Quote, SubscriptionTick


class MarketDataProvider(ABC):
    """
    All market data sources implement this interface.
    Methods are async to support both HTTP-backed and in-process providers.
    """

    @abstractmethod
    async def get_quote(self, symbol: str) -> Quote:
        """Return the latest quote for a symbol."""

    @abstractmethod
    async def get_history(
        self,
        symbol: str,
        start: datetime,
        end: datetime,
        interval: str = "1d",   # "1m" | "5m" | "1h" | "1d"
    ) -> list[OHLCV]:
        """Return OHLCV bars for a date range."""

    @abstractmethod
    async def get_order_book(self, symbol: str, depth: int = 10) -> OrderBook:
        """Return current order book snapshot."""

    @abstractmethod
    async def subscribe(
        self, symbols: list[str]
    ) -> AsyncIterator[SubscriptionTick]:
        """
        Yield real-time ticks for the given symbols.
        The caller is responsible for closing the iterator.
        """

    @abstractmethod
    async def search_symbols(
        self, query: str, asset_type: AssetType | None = None
    ) -> list[dict]:
        """Return a list of matching instruments: {symbol, name, asset_type}."""
```

---

## Market Data Service (Orchestrator + Cache)

```python
# backend/market/service.py

import asyncio
import time
from typing import AsyncIterator

from .models import OHLCV, OrderBook, Quote, SubscriptionTick
from .provider import MarketDataProvider


_QUOTE_TTL = 1.0   # seconds - quotes stale quickly
_HISTORY_TTL = 300.0  # 5 minutes for historical bars


class MarketDataService:
    """
    Wraps a provider with an in-memory TTL cache for quotes and history.
    History is cached; real-time quotes and streams bypass the cache.
    """

    def __init__(self, provider: MarketDataProvider) -> None:
        self._provider = provider
        self._quote_cache: dict[str, tuple[float, Quote]] = {}
        self._history_cache: dict[str, tuple[float, list[OHLCV]]] = {}

    async def get_quote(self, symbol: str, force: bool = False) -> Quote:
        symbol = symbol.upper()
        now = time.monotonic()
        if not force and symbol in self._quote_cache:
            cached_at, quote = self._quote_cache[symbol]
            if now - cached_at < _QUOTE_TTL:
                return quote
        quote = await self._provider.get_quote(symbol)
        self._quote_cache[symbol] = (now, quote)
        return quote

    async def get_quotes(self, symbols: list[str]) -> list[Quote]:
        return list(await asyncio.gather(*[self.get_quote(s) for s in symbols]))

    async def get_history(
        self, symbol: str, start, end, interval: str = "1d"
    ) -> list[OHLCV]:
        key = f"{symbol}:{interval}:{start.date()}:{end.date()}"
        now = time.monotonic()
        if key in self._history_cache:
            cached_at, bars = self._history_cache[key]
            if now - cached_at < _HISTORY_TTL:
                return bars
        bars = await self._provider.get_history(symbol.upper(), start, end, interval)
        self._history_cache[key] = (now, bars)
        return bars

    async def get_order_book(self, symbol: str, depth: int = 10) -> OrderBook:
        return await self._provider.get_order_book(symbol.upper(), depth)

    async def subscribe(
        self, symbols: list[str]
    ) -> AsyncIterator[SubscriptionTick]:
        async for tick in self._provider.subscribe([s.upper() for s in symbols]):
            yield tick

    async def search_symbols(self, query: str, asset_type=None) -> list[dict]:
        return await self._provider.search_symbols(query, asset_type)
```

---

## Simulator Provider

The simulator generates realistic-looking market data without any external dependencies. It uses geometric Brownian motion (GBM) for price evolution so it behaves like real equity prices.

```python
# backend/market/simulator.py

import asyncio
import math
import random
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator

from .models import (
    AssetType, OHLCV, OrderBook, OrderBookLevel, Quote, SubscriptionTick,
)
from .provider import MarketDataProvider


# Seed prices and volatility for well-known symbols
_SYMBOL_PARAMS: dict[str, dict] = {
    "AAPL":  {"price": 185.0, "vol": 0.25, "asset_type": AssetType.STOCK},
    "MSFT":  {"price": 420.0, "vol": 0.22, "asset_type": AssetType.STOCK},
    "GOOGL": {"price": 175.0, "vol": 0.28, "asset_type": AssetType.STOCK},
    "SPY":   {"price": 520.0, "vol": 0.15, "asset_type": AssetType.ETF},
    "BTC":   {"price": 65000.0, "vol": 0.80, "asset_type": AssetType.CRYPTO},
    "ETH":   {"price": 3500.0,  "vol": 0.75, "asset_type": AssetType.CRYPTO},
    "EURUSD":{"price": 1.085,   "vol": 0.08, "asset_type": AssetType.FOREX},
}
_DEFAULT_PARAMS = {"price": 100.0, "vol": 0.30, "asset_type": AssetType.STOCK}


def _gbm_step(price: float, vol: float, dt_years: float) -> float:
    """One GBM step: S(t+dt) = S(t) * exp((mu - vol^2/2)*dt + vol*sqrt(dt)*Z)."""
    mu = 0.05  # 5% annual drift
    z = random.gauss(0, 1)
    return price * math.exp((mu - vol ** 2 / 2) * dt_years + vol * math.sqrt(dt_years) * z)


def _spread_for(price: float) -> float:
    """Return a realistic bid/ask spread."""
    if price > 1000:
        return round(price * 0.0002, 2)
    return max(0.01, round(price * 0.0003, 2))


class SimulatorProvider(MarketDataProvider):
    """
    Generates synthetic market data using GBM for price evolution.
    State is maintained in-process; each instance has independent state.
    """

    def __init__(self, seed: int | None = None) -> None:
        if seed is not None:
            random.seed(seed)
        # Current "live" prices, mutated on each call
        self._prices: dict[str, float] = {
            sym: p["price"] for sym, p in _SYMBOL_PARAMS.items()
        }

    def _params(self, symbol: str) -> dict:
        return _SYMBOL_PARAMS.get(symbol, _DEFAULT_PARAMS)

    def _current_price(self, symbol: str) -> float:
        if symbol not in self._prices:
            self._prices[symbol] = self._params(symbol)["price"]
        return self._prices[symbol]

    def _tick_price(self, symbol: str) -> float:
        """Advance price by one second of simulated time."""
        p = self._params(symbol)
        new_price = _gbm_step(self._prices.get(symbol, p["price"]), p["vol"], 1 / (252 * 6.5 * 3600))
        self._prices[symbol] = new_price
        return new_price

    async def get_quote(self, symbol: str) -> Quote:
        price = self._tick_price(symbol)
        spread = _spread_for(price)
        p = self._params(symbol)
        return Quote(
            symbol=symbol,
            asset_type=p["asset_type"],
            bid=round(price - spread / 2, 4),
            ask=round(price + spread / 2, 4),
            last=round(price, 4),
            volume=random.randint(100, 10_000),
            timestamp=datetime.now(timezone.utc),
        )

    async def get_history(
        self, symbol: str, start: datetime, end: datetime, interval: str = "1d"
    ) -> list[OHLCV]:
        interval_seconds = {"1m": 60, "5m": 300, "1h": 3600, "1d": 86400}[interval]
        dt_years = interval_seconds / (252 * 86400)

        bars: list[OHLCV] = []
        price = self._params(symbol)["price"]
        vol = self._params(symbol)["vol"]
        t = start
        while t <= end:
            open_ = price
            high = open_
            low = open_
            # Simulate intra-bar movement with several sub-steps
            for _ in range(10):
                price = _gbm_step(price, vol, dt_years / 10)
                high = max(high, price)
                low = min(low, price)
            close = price
            bars.append(OHLCV(
                symbol=symbol,
                timestamp=t,
                open=round(open_, 4),
                high=round(high, 4),
                low=round(low, 4),
                close=round(close, 4),
                volume=random.randint(500_000, 5_000_000),
            ))
            t += timedelta(seconds=interval_seconds)
        return bars

    async def get_order_book(self, symbol: str, depth: int = 10) -> OrderBook:
        mid = self._current_price(symbol)
        spread = _spread_for(mid)
        tick = spread / depth

        bids = [
            OrderBookLevel(
                price=round(mid - spread / 2 - i * tick, 4),
                size=random.randint(100, 2000),
            )
            for i in range(depth)
        ]
        asks = [
            OrderBookLevel(
                price=round(mid + spread / 2 + i * tick, 4),
                size=random.randint(100, 2000),
            )
            for i in range(depth)
        ]
        return OrderBook(
            symbol=symbol,
            timestamp=datetime.now(timezone.utc),
            bids=bids,
            asks=asks,
        )

    async def subscribe(
        self, symbols: list[str]
    ) -> AsyncIterator[SubscriptionTick]:
        while True:
            for symbol in symbols:
                price = self._tick_price(symbol)
                yield SubscriptionTick(
                    symbol=symbol,
                    price=round(price, 4),
                    volume=random.randint(1, 500),
                    timestamp=datetime.now(timezone.utc),
                )
            await asyncio.sleep(0.5)   # ~2 ticks/sec per symbol

    async def search_symbols(
        self, query: str, asset_type: AssetType | None = None
    ) -> list[dict]:
        query = query.upper()
        results = []
        for sym, p in _SYMBOL_PARAMS.items():
            if query in sym and (asset_type is None or p["asset_type"] == asset_type):
                results.append({"symbol": sym, "name": sym, "asset_type": p["asset_type"]})
        return results
```

### Simulator Usage Example

```python
import asyncio
from datetime import datetime, timezone, timedelta
from backend.market.simulator import SimulatorProvider
from backend.market.service import MarketDataService

async def demo():
    provider = SimulatorProvider(seed=42)
    service = MarketDataService(provider)

    # Single quote
    quote = await service.get_quote("AAPL")
    print(f"AAPL bid={quote.bid} ask={quote.ask} spread={quote.spread:.4f}")

    # Batch quotes
    quotes = await service.get_quotes(["AAPL", "MSFT", "SPY"])
    for q in quotes:
        print(f"{q.symbol}: {q.last}")

    # Historical bars (last 5 days, daily)
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=5)
    bars = await service.get_history("AAPL", start, end, interval="1d")
    for bar in bars:
        print(f"{bar.timestamp.date()} O={bar.open} H={bar.high} L={bar.low} C={bar.close}")

    # Order book
    book = await service.get_order_book("MSFT", depth=5)
    print(f"Best bid: {book.best_bid.price} x {book.best_bid.size}")
    print(f"Best ask: {book.best_ask.price} x {book.best_ask.size}")

    # Real-time stream (first 5 ticks)
    count = 0
    async for tick in service.subscribe(["AAPL", "MSFT"]):
        print(f"[TICK] {tick.symbol} @ {tick.price}")
        count += 1
        if count >= 5:
            break

asyncio.run(demo())
```

---

## Massive API Provider

Massive is a commercial market data API. The provider wraps its REST and WebSocket endpoints behind the `MarketDataProvider` interface.

### Configuration

```
# .env
MARKET_DATA_PROVIDER=massive   # "massive" | "simulator"
MASSIVE_API_KEY=your_key_here
MASSIVE_BASE_URL=https://api.massive.io/v2
MASSIVE_WS_URL=wss://stream.massive.io/v2
```

### Implementation

```python
# backend/market/massive.py

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import AsyncIterator

import httpx
import websockets

from .models import (
    AssetType, OHLCV, OrderBook, OrderBookLevel, Quote, SubscriptionTick,
)
from .provider import MarketDataProvider


_ASSET_TYPE_MAP = {
    "equity": AssetType.STOCK,
    "etf": AssetType.ETF,
    "crypto": AssetType.CRYPTO,
    "future": AssetType.FUTURE,
    "forex": AssetType.FOREX,
}


class MassiveProvider(MarketDataProvider):
    """
    Integrates with the Massive market data API.
    Uses httpx for REST calls (async) and websockets for streaming.
    """

    def __init__(self) -> None:
        self._api_key = os.environ["MASSIVE_API_KEY"]
        self._base_url = os.environ.get("MASSIVE_BASE_URL", "https://api.massive.io/v2")
        self._ws_url = os.environ.get("MASSIVE_WS_URL", "wss://stream.massive.io/v2")
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={"Authorization": f"Bearer {self._api_key}"},
            timeout=10.0,
        )

    async def _get(self, path: str, params: dict | None = None) -> dict:
        resp = await self._http.get(path, params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_quote(self, symbol: str) -> Quote:
        data = await self._get(f"/quotes/{symbol}")
        return Quote(
            symbol=symbol,
            asset_type=_ASSET_TYPE_MAP.get(data["asset_type"], AssetType.STOCK),
            bid=data["bid"],
            ask=data["ask"],
            last=data["last"],
            volume=data["volume"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
        )

    async def get_history(
        self, symbol: str, start: datetime, end: datetime, interval: str = "1d"
    ) -> list[OHLCV]:
        # Massive uses Unix timestamps and its own interval notation
        _interval_map = {"1m": "1min", "5m": "5min", "1h": "1hour", "1d": "1day"}
        data = await self._get("/ohlcv", params={
            "symbol": symbol,
            "from": int(start.timestamp()),
            "to": int(end.timestamp()),
            "interval": _interval_map[interval],
        })
        return [
            OHLCV(
                symbol=symbol,
                timestamp=datetime.fromtimestamp(bar["t"], tz=timezone.utc),
                open=bar["o"],
                high=bar["h"],
                low=bar["l"],
                close=bar["c"],
                volume=bar["v"],
            )
            for bar in data["bars"]
        ]

    async def get_order_book(self, symbol: str, depth: int = 10) -> OrderBook:
        data = await self._get(f"/orderbook/{symbol}", params={"depth": depth})
        return OrderBook(
            symbol=symbol,
            timestamp=datetime.fromisoformat(data["timestamp"]),
            bids=[OrderBookLevel(price=b["price"], size=b["size"]) for b in data["bids"]],
            asks=[OrderBookLevel(price=a["price"], size=a["size"]) for a in data["asks"]],
        )

    async def subscribe(
        self, symbols: list[str]
    ) -> AsyncIterator[SubscriptionTick]:
        uri = f"{self._ws_url}/stream?token={self._api_key}"
        async with websockets.connect(uri) as ws:
            # Subscribe to tick channel for each symbol
            await ws.send(json.dumps({
                "action": "subscribe",
                "channels": [{"name": "ticks", "symbols": symbols}],
            }))
            async for raw in ws:
                msg = json.loads(raw)
                if msg.get("type") != "tick":
                    continue
                yield SubscriptionTick(
                    symbol=msg["symbol"],
                    price=msg["price"],
                    volume=msg["size"],
                    timestamp=datetime.fromisoformat(msg["timestamp"]),
                    event=msg.get("event", "tick"),
                )

    async def search_symbols(
        self, query: str, asset_type: AssetType | None = None
    ) -> list[dict]:
        params: dict = {"q": query}
        if asset_type:
            params["type"] = asset_type.value
        data = await self._get("/symbols/search", params=params)
        return [
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "asset_type": _ASSET_TYPE_MAP.get(item["type"], AssetType.STOCK),
            }
            for item in data["results"]
        ]

    async def close(self) -> None:
        await self._http.aclose()
```

---

## Provider Factory

```python
# backend/market/factory.py

import os
from .provider import MarketDataProvider
from .service import MarketDataService


def create_provider() -> MarketDataProvider:
    provider_name = os.environ.get("MARKET_DATA_PROVIDER", "simulator").lower()
    if provider_name == "simulator":
        from .simulator import SimulatorProvider
        seed = os.environ.get("SIMULATOR_SEED")
        return SimulatorProvider(seed=int(seed) if seed else None)
    elif provider_name == "massive":
        from .massive import MassiveProvider
        return MassiveProvider()
    else:
        raise ValueError(f"Unknown MARKET_DATA_PROVIDER: {provider_name!r}")


def create_service() -> MarketDataService:
    return MarketDataService(create_provider())
```

---

## FastAPI Routes

```python
# backend/market/routes.py

from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .factory import create_service
from .models import AssetType
from .service import MarketDataService


router = APIRouter(prefix="/market", tags=["market"])

# Single shared service instance (initialized at startup)
_service: MarketDataService | None = None


def get_service() -> MarketDataService:
    assert _service is not None, "Market data service not initialized"
    return _service


def init_service() -> None:
    """Call this from app startup."""
    global _service
    _service = create_service()


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class QuoteResponse(BaseModel):
    symbol: str
    asset_type: str
    bid: float
    ask: float
    last: float
    mid: float
    spread: float
    volume: int
    timestamp: datetime


class OHLCVResponse(BaseModel):
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


class OrderBookLevelResponse(BaseModel):
    price: float
    size: int


class OrderBookResponse(BaseModel):
    symbol: str
    timestamp: datetime
    bids: list[OrderBookLevelResponse]
    asks: list[OrderBookLevelResponse]


class SymbolSearchResult(BaseModel):
    symbol: str
    name: str
    asset_type: str


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@router.get("/quote/{symbol}", response_model=QuoteResponse)
async def get_quote(
    symbol: str,
    svc: Annotated[MarketDataService, Depends(get_service)],
):
    """Return latest quote for a single symbol."""
    q = await svc.get_quote(symbol)
    return QuoteResponse(
        symbol=q.symbol,
        asset_type=q.asset_type.value,
        bid=q.bid,
        ask=q.ask,
        last=q.last,
        mid=q.mid,
        spread=q.spread,
        volume=q.volume,
        timestamp=q.timestamp,
    )


@router.get("/quotes", response_model=list[QuoteResponse])
async def get_quotes(
    symbols: Annotated[str, Query(description="Comma-separated symbols, e.g. AAPL,MSFT")],
    svc: Annotated[MarketDataService, Depends(get_service)],
):
    """Return latest quotes for multiple symbols."""
    symbol_list = [s.strip() for s in symbols.split(",") if s.strip()]
    quotes = await svc.get_quotes(symbol_list)
    return [
        QuoteResponse(
            symbol=q.symbol,
            asset_type=q.asset_type.value,
            bid=q.bid,
            ask=q.ask,
            last=q.last,
            mid=q.mid,
            spread=q.spread,
            volume=q.volume,
            timestamp=q.timestamp,
        )
        for q in quotes
    ]


@router.get("/history/{symbol}", response_model=list[OHLCVResponse])
async def get_history(
    symbol: str,
    svc: Annotated[MarketDataService, Depends(get_service)],
    interval: Annotated[str, Query(pattern="^(1m|5m|1h|1d)$")] = "1d",
    days: Annotated[int, Query(ge=1, le=365)] = 30,
):
    """Return OHLCV history. Default: daily bars for last 30 days."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    bars = await svc.get_history(symbol, start, end, interval)
    return [
        OHLCVResponse(
            symbol=b.symbol,
            timestamp=b.timestamp,
            open=b.open,
            high=b.high,
            low=b.low,
            close=b.close,
            volume=b.volume,
        )
        for b in bars
    ]


@router.get("/orderbook/{symbol}", response_model=OrderBookResponse)
async def get_order_book(
    symbol: str,
    svc: Annotated[MarketDataService, Depends(get_service)],
    depth: Annotated[int, Query(ge=1, le=50)] = 10,
):
    """Return order book snapshot."""
    book = await svc.get_order_book(symbol, depth)
    return OrderBookResponse(
        symbol=book.symbol,
        timestamp=book.timestamp,
        bids=[OrderBookLevelResponse(price=l.price, size=l.size) for l in book.bids],
        asks=[OrderBookLevelResponse(price=l.price, size=l.size) for l in book.asks],
    )


@router.get("/search", response_model=list[SymbolSearchResult])
async def search_symbols(
    q: Annotated[str, Query(min_length=1)],
    svc: Annotated[MarketDataService, Depends(get_service)],
    asset_type: AssetType | None = None,
):
    """Search for symbols by name or ticker."""
    results = await svc.search_symbols(q, asset_type)
    return [
        SymbolSearchResult(
            symbol=r["symbol"],
            name=r["name"],
            asset_type=r["asset_type"].value if isinstance(r["asset_type"], AssetType) else r["asset_type"],
        )
        for r in results
    ]


# ---------------------------------------------------------------------------
# WebSocket streaming
# ---------------------------------------------------------------------------

@router.websocket("/ws")
async def market_stream(
    websocket: WebSocket,
    svc: Annotated[MarketDataService, Depends(get_service)],
):
    """
    WebSocket endpoint for real-time market data.

    Client sends: {"action": "subscribe", "symbols": ["AAPL", "MSFT"]}
    Server sends:  {"symbol": "AAPL", "price": 185.23, "volume": 300,
                    "timestamp": "...", "event": "tick"}
    """
    await websocket.accept()
    try:
        config = await websocket.receive_json()
        symbols = config.get("symbols", [])
        if not symbols:
            await websocket.send_json({"error": "No symbols specified"})
            await websocket.close()
            return

        async for tick in svc.subscribe(symbols):
            await websocket.send_json({
                "symbol": tick.symbol,
                "price": tick.price,
                "volume": tick.volume,
                "timestamp": tick.timestamp.isoformat(),
                "event": tick.event,
            })
    except WebSocketDisconnect:
        pass
```

### Registering Routes in FastAPI App

```python
# backend/main.py  (additions)

from market.routes import router as market_router, init_service
from contextlib import asynccontextmanager
from fastapi import FastAPI


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_service()     # initialize on startup
    yield
    # teardown (close HTTP clients etc.) would go here


app = FastAPI(lifespan=lifespan)
app.include_router(market_router)
```

---

## REST API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/market/quote/{symbol}` | Single quote |
| GET | `/market/quotes?symbols=X,Y` | Batch quotes |
| GET | `/market/history/{symbol}?interval=1d&days=30` | OHLCV history |
| GET | `/market/orderbook/{symbol}?depth=10` | Order book snapshot |
| GET | `/market/search?q=APP&asset_type=stock` | Symbol search |
| WS  | `/market/ws` | Real-time tick stream |

### Example Requests

```bash
# Single quote
curl http://localhost:8000/market/quote/AAPL

# Batch quotes
curl "http://localhost:8000/market/quotes?symbols=AAPL,MSFT,SPY"

# 1-hour bars for last 7 days
curl "http://localhost:8000/market/history/AAPL?interval=1h&days=7"

# Order book (20 levels)
curl "http://localhost:8000/market/orderbook/AAPL?depth=20"

# Symbol search
curl "http://localhost:8000/market/search?q=APP&asset_type=stock"
```

### Example Responses

**GET /market/quote/AAPL**
```json
{
  "symbol": "AAPL",
  "asset_type": "stock",
  "bid": 184.97,
  "ask": 185.03,
  "last": 185.00,
  "mid": 185.00,
  "spread": 0.06,
  "volume": 4821,
  "timestamp": "2026-03-21T14:32:01.123456Z"
}
```

**GET /market/history/AAPL?interval=1d&days=3**
```json
[
  {"symbol":"AAPL","timestamp":"2026-03-18T00:00:00Z","open":183.10,"high":186.40,"low":182.55,"close":185.00,"volume":52341000},
  {"symbol":"AAPL","timestamp":"2026-03-19T00:00:00Z","open":185.00,"high":187.20,"low":184.10,"close":186.50,"volume":48120000},
  {"symbol":"AAPL","timestamp":"2026-03-20T00:00:00Z","open":186.50,"high":188.00,"low":185.30,"close":187.10,"volume":51200000}
]
```

**GET /market/orderbook/AAPL?depth=3**
```json
{
  "symbol": "AAPL",
  "timestamp": "2026-03-21T14:32:01Z",
  "bids": [
    {"price": 184.97, "size": 500},
    {"price": 184.95, "size": 1200},
    {"price": 184.93, "size": 800}
  ],
  "asks": [
    {"price": 185.03, "size": 300},
    {"price": 185.05, "size": 950},
    {"price": 185.07, "size": 1100}
  ]
}
```

**WebSocket stream message**
```json
{"symbol": "AAPL", "price": 185.02, "volume": 150, "timestamp": "2026-03-21T14:32:02Z", "event": "tick"}
```

---

## File Structure

```
backend/
  market/
    __init__.py
    models.py        # Quote, OHLCV, OrderBook, SubscriptionTick dataclasses
    provider.py      # MarketDataProvider abstract base class
    service.py       # MarketDataService (cache + orchestration)
    simulator.py     # SimulatorProvider (GBM-based synthetic data)
    massive.py       # MassiveProvider (Massive API integration)
    factory.py       # create_provider() / create_service()
    routes.py        # FastAPI router + WebSocket endpoint
```

---

## Testing

```python
# backend/tests/test_market.py

import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

from market.simulator import SimulatorProvider
from market.service import MarketDataService


@pytest.fixture
def service():
    return MarketDataService(SimulatorProvider(seed=0))


@pytest.mark.asyncio
async def test_quote_fields(service):
    q = await service.get_quote("AAPL")
    assert q.symbol == "AAPL"
    assert q.bid < q.ask
    assert q.spread > 0
    assert q.mid == (q.bid + q.ask) / 2


@pytest.mark.asyncio
async def test_batch_quotes(service):
    quotes = await service.get_quotes(["AAPL", "MSFT", "SPY"])
    assert len(quotes) == 3
    symbols = {q.symbol for q in quotes}
    assert symbols == {"AAPL", "MSFT", "SPY"}


@pytest.mark.asyncio
async def test_history_returns_bars(service):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=5)
    bars = await service.get_history("AAPL", start, end, "1d")
    assert len(bars) >= 4   # at least 4 trading days in 5 calendar days
    for bar in bars:
        assert bar.low <= bar.open <= bar.high
        assert bar.low <= bar.close <= bar.high


@pytest.mark.asyncio
async def test_order_book_depth(service):
    book = await service.get_order_book("MSFT", depth=5)
    assert len(book.bids) == 5
    assert len(book.asks) == 5
    assert book.best_bid.price < book.best_ask.price


@pytest.mark.asyncio
async def test_subscribe_yields_ticks(service):
    ticks = []
    async for tick in service.subscribe(["AAPL"]):
        ticks.append(tick)
        if len(ticks) >= 3:
            break
    assert all(t.symbol == "AAPL" for t in ticks)
    assert all(t.price > 0 for t in ticks)


@pytest.mark.asyncio
async def test_quote_cache(service):
    q1 = await service.get_quote("AAPL")
    q2 = await service.get_quote("AAPL")   # should hit cache
    assert q1.timestamp == q2.timestamp    # same cached object


@pytest.mark.asyncio
async def test_quote_cache_bypass(service):
    q1 = await service.get_quote("AAPL")
    q2 = await service.get_quote("AAPL", force=True)
    # forced refresh: timestamps may differ since simulator advances state
    assert q2.last >= 0  # just check it succeeded


# FastAPI integration test
@pytest.mark.asyncio
async def test_api_quote_endpoint():
    import os
    os.environ["MARKET_DATA_PROVIDER"] = "simulator"
    os.environ["SIMULATOR_SEED"] = "42"

    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/market/quote/AAPL")
    assert resp.status_code == 200
    body = resp.json()
    assert body["symbol"] == "AAPL"
    assert body["bid"] < body["ask"]


@pytest.mark.asyncio
async def test_api_history_endpoint():
    import os
    os.environ["MARKET_DATA_PROVIDER"] = "simulator"

    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/market/history/AAPL?interval=1d&days=5")
    assert resp.status_code == 200
    bars = resp.json()
    assert isinstance(bars, list)
    assert len(bars) > 0
    assert all(b["low"] <= b["close"] <= b["high"] for b in bars)
```

---

## Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `MARKET_DATA_PROVIDER` | `simulator` | Active provider: `simulator` or `massive` |
| `SIMULATOR_SEED` | (none) | Integer seed for reproducible simulation |
| `MASSIVE_API_KEY` | required if provider=massive | Massive API authentication key |
| `MASSIVE_BASE_URL` | `https://api.massive.io/v2` | Massive REST base URL |
| `MASSIVE_WS_URL` | `wss://stream.massive.io/v2` | Massive WebSocket URL |

---

## Dependencies to Add

```toml
# pyproject.toml / requirements additions
httpx = ">=0.27"
websockets = ">=13.0"
```

---

## Design Decisions

- **Dataclasses over Pydantic models** for internal domain objects - faster, no validation overhead at the provider layer. Pydantic is used only at the API boundary (response schemas).
- **TTL cache in MarketDataService** keeps the provider interface simple. Providers do not need to implement caching.
- **GBM simulator** produces prices that follow log-normal distribution, matching real equity price behavior. The seed parameter makes tests deterministic.
- **WebSocket handler** reads a single subscribe message then streams indefinitely. The caller controls the lifecycle by closing the connection.
- **Factory function** reads `MARKET_DATA_PROVIDER` at startup so switching sources requires only an env change, no code changes.
