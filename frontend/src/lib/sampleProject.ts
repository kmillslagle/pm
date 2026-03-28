import type { ProjectBoardData } from "@/lib/kanban";

export const SAMPLE_PROJECT_ID = -999;

export const SAMPLE_PROJECT: ProjectBoardData = {
  project_id: SAMPLE_PROJECT_ID,
  project_name: "Sample-Bake a cake",
  workstreams: [
    {
      id: -1,
      name: "Preparation",
      columns: [
        {
          id: "sample-col-todo-1",
          title: "To Do",
          cardIds: ["sample-card-1"],
        },
        {
          id: "sample-col-progress-1",
          title: "In Progress",
          cardIds: ["sample-card-2"],
        },
        {
          id: "sample-col-done-1",
          title: "Done",
          cardIds: ["sample-card-3"],
        },
      ],
      cards: {
        "sample-card-1": {
          id: "sample-card-1",
          title: "Preheat oven to 350°F",
          details:
            "Set the oven to 350°F (175°C) and allow at least 10 minutes for it to reach temperature. Confirm with an oven thermometer if available.",
          priority: "high",
          deliverableType: "Checklist",
          keyReferences: "Recipe p.1 — Oven Setup",
          dependencies: [],
          notes: "Gas ovens may need 15 minutes. Check the seal on the door.",
          subtasks: [
            { id: "st-1a", title: "Check oven rack position (middle)", done: false },
            { id: "st-1b", title: "Verify thermometer reading", done: false },
          ],
          dueDate: "",
        },
        "sample-card-2": {
          id: "sample-card-2",
          title: "Gather dry ingredients",
          details:
            "Measure 2 cups flour, 1.5 cups sugar, 1 tsp baking powder, 0.5 tsp salt. Sift together into a large bowl to remove lumps.",
          priority: "medium",
          deliverableType: "Checklist",
          keyReferences: "Recipe p.2 — Dry Mix",
          dependencies: [],
          notes: "Use a whisk after sifting to ensure even distribution.",
          subtasks: [
            { id: "st-2a", title: "Measure flour (spooned, not scooped)", done: true },
            { id: "st-2b", title: "Sift all dry ingredients together", done: false },
          ],
          dueDate: "",
        },
        "sample-card-3": {
          id: "sample-card-3",
          title: "Grease and flour cake pans",
          details:
            "Coat two 9-inch round pans with butter and a light dusting of flour. Tap out excess. Line bottoms with parchment circles for easy release.",
          priority: "low",
          deliverableType: "Template",
          keyReferences: "Recipe p.1 — Pan Prep",
          dependencies: [],
          notes: "Parchment rounds can be cut in advance and stored flat.",
          subtasks: [],
          dueDate: "",
        },
      },
    },
    {
      id: -2,
      name: "Baking & Decoration",
      columns: [
        {
          id: "sample-col-todo-2",
          title: "Queue",
          cardIds: ["sample-card-4"],
        },
        {
          id: "sample-col-progress-2",
          title: "In Progress",
          cardIds: ["sample-card-5"],
        },
        {
          id: "sample-col-review-2",
          title: "Review",
          cardIds: ["sample-card-6"],
        },
        {
          id: "sample-col-done-2",
          title: "Complete",
          cardIds: [],
        },
      ],
      cards: {
        "sample-card-4": {
          id: "sample-card-4",
          title: "Mix wet ingredients into dry",
          details:
            "Create a well in the dry mix. Add eggs, milk, oil, and vanilla. Beat on medium speed for 2 minutes until smooth. Fold in boiling water last — batter will be thin.",
          priority: "high",
          deliverableType: "Memo",
          keyReferences: "Recipe p.3 — Batter Assembly",
          dependencies: ["Gather dry ingredients"],
          notes:
            "Do not overmix after adding water. Thin batter is normal and produces a moist cake.",
          subtasks: [
            { id: "st-4a", title: "Beat eggs + milk + oil 2 min", done: false },
            { id: "st-4b", title: "Fold in boiling water gently", done: false },
          ],
          dueDate: "",
        },
        "sample-card-5": {
          id: "sample-card-5",
          title: "Bake layers for 30-35 minutes",
          details:
            "Divide batter evenly between prepared pans. Bake until a toothpick inserted in the center comes out clean. Cool in pans 10 min, then turn out onto wire racks.",
          priority: "high",
          deliverableType: "Analysis",
          keyReferences: "Recipe p.4 — Bake Times",
          dependencies: ["Preheat oven to 350°F", "Mix wet ingredients into dry"],
          notes:
            "Rotate pans halfway through for even browning. Do not open the oven door in the first 20 minutes.",
          subtasks: [
            { id: "st-5a", title: "Set timer for 30 minutes", done: false },
            { id: "st-5b", title: "Toothpick test at 30 min", done: false },
            { id: "st-5c", title: "Cool on rack completely before frosting", done: false },
          ],
          dueDate: "",
        },
        "sample-card-6": {
          id: "sample-card-6",
          title: "Frost and decorate the cake",
          details:
            "Apply a thin crumb coat of buttercream and chill 15 min. Add the final layer of frosting with an offset spatula. Decorate with sprinkles, fruit, or piped borders.",
          priority: "medium",
          deliverableType: "Agreement",
          keyReferences: "Recipe p.5 — Frosting & Finishing",
          dependencies: ["Bake layers for 30-35 minutes"],
          notes:
            "Buttercream firms up in the fridge — let it soften 10 min before the final coat. Try a bench scraper for smooth sides.",
          subtasks: [
            { id: "st-6a", title: "Crumb coat + chill 15 min", done: false },
            { id: "st-6b", title: "Final frost with offset spatula", done: false },
            { id: "st-6c", title: "Add decorations", done: false },
          ],
          dueDate: "",
        },
      },
    },
  ],
};
