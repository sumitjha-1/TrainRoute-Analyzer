# CRIS Train Movement Chart

An interactive **time–distance graph** (train movement chart) for railway timetables. Upload a route file and a schedule file, see every train plotted against time and distance, edit train timings directly on the graph, and export the result as an image, PDF or an updated schedule file.

🔗 **Live demo:** [https://trainroute-analyzer.onrender.com](https://trainroute-analyzer.onrender.com)

---

## Features

### Visualisation
- Time on the X axis, stations (scaled by distance) on the Y axis
- Automatic **day detection** for trains that cross midnight
- Three view modes: **Day-wise**, **Weekly** and **Layered**
- Day filter, train filter, search by train number / name
- Station search with a "show only trains stopping here" filter
- Zoom with buttons or `Ctrl / ⌘ + mouse wheel` (zooms around the cursor)
- Dark and light theme, full-screen mode, print support
- Large schedules are handled with column virtualisation (only visible day columns are drawn)

### Editing
- Right-click a train → **Edit train** (one train is edited at a time)
- **Drag** the arrival (red) / departure (green) half-discs sideways to change a time
- Hold **Shift** (or enable single-side mode) to move only one side and change the halt duration
- Double-click a halt to turn it into a non-stoppage
- Edit exact times from the details panel, and edit station distances from the station axis
- Undo support, and Save / Cancel from the edit bar
- **Validation on Save**: time can never move backwards along a train's route; errors are listed and can be located on the graph
- **Previous path**: the original path of an edited train is drawn as a faded highlighter line behind the new one, with a station-by-station diff in the details panel

### Export
| Export | Description |
|---|---|
| PNG / PDF (screenshot) | Image of the current graph |
| Vector PDF (all trains) | Draws every train directly into the PDF, one page per day. Works for 500+ trains without freezing |
| Schedule file (uploaded format) | Writes the edited schedule back in the **same format as the uploaded file**, with previous and current timings plus `TIME_CHANGED` / `TRAIN_STATUS` columns |
| Simple CSV | Flat table with previous vs current timings |

Export scope can be: all trains, currently visible trains, picked trains, or a single train.

---

## Input file formats

Supported file types: `.csv`, `.txt`, `.xlsx`, `.xls` (up to 15 MB).

### Route file
Stations with cumulative distance. Recognised headers include `station` / `station code` / `code`, `station name` / `name`, and `distance` / `km` / `cumulative distance`.

```csv
Station,Station Name,Distance
NDLS,New Delhi,0
GZB,Ghaziabad,23
```

### Schedule file
Three layouts are detected automatically:

1. **Merged Excel format** — columns such as `MAVTRAINNUMBER`, `MAVSTTNCODE`, `MANSEQNUMBER`, `MANWTTARVL`, `MANWTTDPRT`, `MANWTTDAYOFRUN` (and the `MANPTT*` equivalents)
2. **Column-based format** — columns `Train`, `Station`, `Entry_Time`, `Exit_Time` (optional block / line columns)
3. **Text format** — lines like `Train 12345 Name`, followed by rows of `STATION  HH:MM  HH:MM`

---

## Tech stack

- [React](https://react.dev/) with function components and hooks
- [Zustand](https://github.com/pmndrs/zustand) for state management
- [PapaParse](https://www.papaparse.com/) and [SheetJS (xlsx)](https://sheetjs.com/) for reading and writing files
- [html2canvas](https://html2canvas.hertzen.com/) and [jsPDF](https://github.com/parallax/jsPDF) for exports
- [lucide-react](https://lucide.dev/) for icons
- Plain CSS with theme variables (no CSS framework)

---

## Getting started

You can use the app directly online: [https://trainroute-analyzer.onrender.com](https://trainroute-analyzer.onrender.com)

To run it on your own computer:

1. Download the ZIP file and extract it.
2. Open a terminal inside the extracted folder.
3. Run:

```bash
npm install
npm run dev
```

4. Open the link shown in the terminal (usually `http://localhost:5173`).

> Requires [Node.js](https://nodejs.org/) 18 or newer.

---

## How to use

1. Open the **Data files** section in the left sidebar and upload the **Route file**, then the **Schedule file**.
2. Use the toolbar to zoom, switch view mode, filter days, or show / hide previous paths.
3. Click a train (on the graph or in the train list) to see its stops in the right-hand details panel.
4. To change timings: **right-click a train → Edit train**, drag the points or edit times in the details panel, then press **Save**.
5. Use **Download** in the toolbar to export the graph or the schedule.

---

## Project structure

```
src/
├── components/
│   ├── common/      Button, EmptyState, ValidationPanel
│   ├── dialogs/     ConfirmDialog, SaveErrorBox
│   ├── graph/       TimeDistanceGraph, DayPanel, DayPanelGrid, StationAxis, Legend, ...
│   ├── layout/      Header, Sidebar, DetailsPanel
│   ├── stations/    StationSearch
│   ├── toolbar/     Toolbar, DownloadMenu
│   ├── trains/      TrainFilterPanel, StationSearchResult
│   └── upload/      FileUploadCard
├── services/
│   ├── fileParser/  rawTableReader, routeParser, scheduleParser, normalize
│   └── exportService.js
├── store/           useAppStore.js (Zustand store: data, edit/save workflow)
├── styles/          theme.css (dark / light theme variables)
├── types/           JSDoc type definitions
└── utils/
    ├── graph/       coordinates, pathBuilder, pathDiff, saveEngine, editValidation, ...
    └── time/        time.js (clock / day-offset helpers)
```

---

## How time is handled

Every stop time is stored as an **absolute minute value** (`day * 1440 + hh * 60 + mm`). When a time is earlier than the previous one in a flat schedule file, the day index is incremented automatically (midnight crossing). All comparisons and validation run on absolute minutes, so a `23:50 → 00:20` movement is correctly treated as a forward move.

In the Weekly view, day offsets are grouped by `offset mod 7` (Monday-based).

---

