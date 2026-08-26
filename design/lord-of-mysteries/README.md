# Lord of Mysteries

This directory is reserved for the Lord of Mysteries project.

## Current Prototype

Open [`work/index.html`](./work/index.html) directly in a browser to use the Railway Tycoon route forecast tool.

The prototype supports:

- Switching between the five route difficulty buttons
- Entering the full-game quota for winery, food shop, and trading house stations
- Selecting the initial three-station hint from the origin station
- Selecting the current station type at every later step
- Selecting the newly revealed hint for the following three stations
- Showing probabilities only for the three stations covered by the selected hint
- Showing joint three-station route combinations alongside per-station marginal probabilities
- Filtering all valid station sequences for the selected route length against the entered quota, current station, and hint constraints

The forecast engine uses exhaustive sequence enumeration. The origin hint constrains stations 1 to 3. Each later step locks the current station and applies a hint to the next three stations. A `most` hint requires that type to appear strictly more often than the other two types in the three-station window. An `equal` hint requires one station of each type. The UI labels per-station figures as marginal probabilities and also lists the joint three-station combinations, so a route such as food, winery, winery remains visible as one valid outcome.

This is a standalone interaction prototype. Production integration, authoritative game data, assets, and route-specific rules remain future work.
