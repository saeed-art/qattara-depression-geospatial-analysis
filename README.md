# Marsa Matruh & Qattara Depression — Elevation & Land Use Analysis

Identifies the **highest and lowest elevation points** in Marsa Matruh Governorate (including the Qattara Depression) using Google Earth Engine.

**DEM:** Copernicus GLO-30 (30 m) &nbsp;|&nbsp; **Land Use:** ESA WorldCover 2021 (10 m)

---

## Files

| File | Purpose |
|---|---|
| `main.js` | GEE JavaScript script — paste into the Code Editor |
| `MarsaMatruh_Elevation_LandUse.ipynb` | Google Colab notebook (Python equivalent) |
| `requirements.txt` | Python dependencies for the notebook |

---

## Quick Start

### Option A — GEE Code Editor (JavaScript)

1. Open [code.earthengine.google.com](https://code.earthengine.google.com/) and sign in
2. Create a new script, paste the contents of `main.js`, click **Run**

### Option B — Google Colab (Python)

1. Upload `MarsaMatruh_Elevation_LandUse.ipynb` to [colab.research.google.com](https://colab.research.google.com)
2. In **Cell 2**, replace `'ee-your-project-id'` with your GEE Cloud project ID
3. `Runtime → Run all`

> **No GEE account?** Register at [signup.earthengine.google.com](https://signup.earthengine.google.com/). Approval is usually instant for Google Cloud projects.

---

## Study Area

Marsa Matruh Governorate + Qattara Depression, NW Egypt

| Boundary | Value |
|---|---|
| West | 24.8 °E (Libya border) |
| East | 30.5 °E |
| South | 28.2 °N |
| North | 31.6 °N (Mediterranean coast) |

Notable features: Qattara Depression (≈ −133 m, lowest point in Africa), coastal strip, desert plateaus.

---

## Map Layers

| Layer | Notes |
|---|---|
| Elevation — Copernicus GLO-30 | Color-coded DEM; blue = low, red = high |
| Contour Lines (50 m) | Toggleable |
| Study Area Boundary | White outline |
| Highest Point | Red marker |
| Lowest Point (Qattara) | Blue marker |
| Below Sea Level (< 0 m) | Dark blue overlay |
| Land Use / Land Cover | ESA WorldCover 2021; hidden by default — toggle on to view |

---

## Export

Set `exportToDrive: true` (JS) or `CONFIG['export_to_drive'] = True` (Colab), then re-run.  
Exports both the DEM and land use rasters as GeoTIFF to the `GEE_MarsaMatruh` folder in Google Drive.