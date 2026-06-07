// =============================================================================
//  MAIN.JS — Marsa Matruh & Qattara Depression — Elevation & Land Use Analysis
//  Google Earth Engine Script
//
//  USAGE:
//    1. Open https://code.earthengine.google.com/
//    2. Paste this entire file into a new script
//    3. Click Run
//
//  Study Area : Marsa Matruh Governorate + Qattara Depression, NW Egypt
//  DEM Source  : Copernicus GLO-30 (30 m, most accurate public global DEM)
//
//  NOTE: All Map.addLayer() calls are inside stats.evaluate() so that
//        min/max are real JavaScript numbers (not ee.Number objects).
//        This is required for the layer visibility toggle to work correctly.
// =============================================================================


// =============================================================================
//  CONFIGURATION
// =============================================================================
var CONFIG = {
  contourInterval: 50,                        // Contour interval (meters)
  landUseYear: 2021,                       // ESA WorldCover year (2020 or 2021)
  exportToDrive: true,                      // true — export GeoTIFF to Drive
  exportFolderName: 'GEE_MarsaMatruh',           // Google Drive folder name
  exportDEM: 'MarsaMatruh_Qattara_DEM',  // DEM export filename
  exportLandUse: 'MarsaMatruh_Qattara_LULC', // Land use export filename
  exportScale: 30,                         // Export pixel size (meters)
};


// =============================================================================
//  STUDY AREA — Marsa Matruh Governorate + Qattara Depression
//
//  Bounds:
//    West  : 24.8 E  (Libya border)
//    East  : 30.5 E  (eastern edge of Qattara + governorate)
//    South : 28.2 N  (southern extent of Qattara Depression)
//    North : 31.6 N  (Mediterranean coastline near Marsa Matruh city)
//
//  Key features in this area:
//    Qattara Depression  — -133 m (lowest point in Africa)
//    Mediterranean coast — sea level
//    Sand seas and plateaus — 100-300 m
//    Escarpments (Qattara rim) — up to ~350 m
// =============================================================================
var geometry = ee.Geometry.Polygon(
  [[[24.8, 28],   // SW corner
  [30.5, 28],   // SE corner
  [30.5, 31.6],   // NE corner
  [24.8, 31.6]]], // NW corner
  null, false
);

// To use a different area, uncomment one of these:
// Qattara Depression only (tight bbox)
// var geometry = ee.Geometry.Rectangle([26.0, 28.5, 29.8, 30.8]);

// Marsa Matruh city and coast only
// var geometry = ee.Geometry.Rectangle([26.5, 30.5, 28.5, 31.5]);

// Full Marsa Matruh Governorate + Qattara (same as default above)
// var geometry = ee.Geometry.Rectangle([24.8, 28.2, 30.5, 31.6]);


// =============================================================================
//  ELEVATION COLOR PALETTE  (blue=lowest — white=sea level — red=highest)
//  Designed for areas that include negative elevations (Qattara)
// =============================================================================
var elevPalette = [
  '#08306b',  // very deep blue   (lowest / below sea level)
  '#2171b5',  // blue
  '#6baed6',  // light blue
  '#bdd7e7',  // very pale blue
  '#ffffff',  // white            (sea level 0 m)
  '#ffffb2',  // pale yellow
  '#fecc5c',  // yellow-orange
  '#fd8d3c',  // orange
  '#f03b20',  // red-orange
  '#bd0026',  // red
  '#67000d',  // dark red         (highest peaks)
];


// =============================================================================
//  1. LOAD DEM
// =============================================================================
print('====================================================');
print('  Marsa Matruh & Qattara Depression — Elevation Analysis');
print('  DEM: Copernicus GLO-30 (30 m)');
print('====================================================');

var copDEM = ee.ImageCollection('COPERNICUS/DEM/GLO30')
  .filterBounds(geometry)
  .select('DEM')
  .mosaic()
  .clip(geometry);

print('DEM loaded:', copDEM);


// =============================================================================
//  2. COMPUTE STATISTICS  (server-side ee.Dictionary)
// =============================================================================
var stats = copDEM.reduceRegion({
  reducer: ee.Reducer.minMax()
    .combine(ee.Reducer.mean(), '', true)
    .combine(ee.Reducer.stdDev(), '', true),
  geometry: geometry,
  scale: 90,         // 90 m for speed over this large area
  maxPixels: 1e13,
  bestEffort: true
});

var areaKm2 = geometry.area({ maxError: 100 }).divide(1e6);

var maxElev = ee.Number(stats.get('DEM_max'));
var minElev = ee.Number(stats.get('DEM_min'));


// =============================================================================
//  3. LOCATE HIGHEST & LOWEST POINTS
// =============================================================================

// Highest point
var highestPoint = copDEM.eq(maxElev.toFloat()).selfMask()
  .reduceToVectors({
    geometry: geometry,
    scale: 90,
    geometryType: 'centroid',
    maxPixels: 1e13,
    bestEffort: true
  });

// Lowest point
var lowestPoint = copDEM.eq(minElev.toFloat()).selfMask()
  .reduceToVectors({
    geometry: geometry,
    scale: 90,
    geometryType: 'centroid',
    maxPixels: 1e13,
    bestEffort: true
  });

var highestCoords = ee.Feature(highestPoint.first()).geometry().coordinates();
var lowestCoords = ee.Feature(lowestPoint.first()).geometry().coordinates();


// =============================================================================
//  4. PRINT RESULTS
// =============================================================================
print('');
print('=== ELEVATION ANALYSIS RESULTS ===');
print('Area (km2):', areaKm2);
print('');
print('HIGHEST POINT');
print('  Elevation (m):        ', maxElev);
print('  Coordinates [lon,lat]:', highestCoords);
print('');
print('LOWEST POINT (expect approx. -133 m in Qattara Depression)');
print('  Elevation (m):        ', minElev);
print('  Coordinates [lon,lat]:', lowestCoords);
print('');
print('STATISTICS');
print('  Min (m): ', stats.get('DEM_min'));
print('  Max (m): ', stats.get('DEM_max'));
print('  Mean(m): ', stats.get('DEM_mean'));
print('  StdDev : ', stats.get('DEM_stdDev'));
print('====================================================');


// =============================================================================
//  5. PRECOMPUTE TERRAIN LAYERS (server-side)
// =============================================================================
var contours = copDEM
  .divide(CONFIG.contourInterval).floor().multiply(CONFIG.contourInterval)
  .subtract(copDEM).abs().lt(8)   // pixels within 8 m of a contour level
  .selfMask();

// Boundary outline image
var boundaryImg = ee.Image().paint({
  featureCollection: ee.FeatureCollection([ee.Feature(geometry)]),
  color: 1,
  width: 2
});


// =============================================================================
//  6. LOAD LAND USE / LAND COVER — ESA WorldCover 10 m
//
//  Dataset : ESA WorldCover v200 (2021)
//  Asset ID: ESA/WorldCover/v200
//  Resolution: 10 m
//  Coverage : Global
//
//  Class values and meanings:
//    10  Tree cover
//    20  Shrubland
//    30  Grassland
//    40  Cropland
//    50  Built-up
//    60  Bare / sparse vegetation  (dominant in this desert region)
//    70  Snow and ice
//    80  Permanent water bodies
//    90  Herbaceous wetland
//    95  Mangroves
//   100  Moss and lichen
// =============================================================================
var worldCover = ee.ImageCollection('ESA/WorldCover/v200')
  .filterBounds(geometry)
  .first()
  .clip(geometry);

print('Land use loaded (ESA WorldCover 2021):', worldCover);

// Palette — indexed to match WorldCover class values (10,20,...,100)
// Colors follow ESA WorldCover official color scheme
var lcPalette = [
  '006400',  // 10  Tree cover           (dark green)
  'ffbb22',  // 20  Shrubland            (amber)
  'ffff4c',  // 30  Grassland            (yellow)
  'f096ff',  // 40  Cropland             (pink)
  'fa0000',  // 50  Built-up             (red)
  'b4b4b4',  // 60  Bare / sparse veg    (grey)  <-- dominant in Qattara
  'f0f0f0',  // 70  Snow and ice         (white)
  '0064c8',  // 80  Permanent water      (blue)
  '0096a0',  // 90  Herbaceous wetland   (teal)
  '00cf75',  // 95  Mangroves            (bright green)
  'fae6a0',  // 100 Moss and lichen      (light cream)
];

// Land cover class definitions for the legend
var LC_CLASSES = [
  { value: 10, label: 'Tree cover', color: '006400' },
  { value: 20, label: 'Shrubland', color: 'ffbb22' },
  { value: 30, label: 'Grassland', color: 'ffff4c' },
  { value: 40, label: 'Cropland', color: 'f096ff' },
  { value: 50, label: 'Built-up', color: 'fa0000' },
  { value: 60, label: 'Bare / sparse veg.', color: 'b4b4b4' },
  { value: 70, label: 'Snow and ice', color: 'f0f0f0' },
  { value: 80, label: 'Permanent water', color: '0064c8' },
  { value: 90, label: 'Herbaceous wetland', color: '0096a0' },
  { value: 95, label: 'Mangroves', color: '00cf75' },
  { value: 100, label: 'Moss and lichen', color: 'fae6a0' },
];


// =============================================================================
//  7. MAP SETUP
// =============================================================================
Map.centerObject(geometry, 7);


// =============================================================================
//  8. ADD ALL LAYERS INSIDE stats.evaluate()
//
//  All Map.addLayer() calls are here because vis params min/max must be
//  plain JavaScript numbers. Passing ee.Number objects causes GEE to ignore
//  them silently, making the visibility toggle appear broken.
// =============================================================================
stats.evaluate(function (statsResult) {

  var minVal = statsResult.DEM_min;
  var maxVal = statsResult.DEM_max;

  print('');
  print('Visualization loaded — elevation range:');
  print('  Min =', minVal.toFixed(1), 'm  |  Max =', maxVal.toFixed(1), 'm');

  // Layer 1: Elevation (color-coded)
  Map.addLayer(
    copDEM,
    { min: minVal, max: maxVal, palette: elevPalette },
    'Elevation — Copernicus GLO-30',
    true,
    1.0
  );

  // Layer 2: Contour lines
  Map.addLayer(
    contours,
    { palette: ['222222'] },
    'Contour Lines (' + CONFIG.contourInterval + ' m)',
    true,
    0.5
  );

  // Layer 3: Study area boundary
  Map.addLayer(
    boundaryImg,
    { palette: ['FFFFFF'] },
    'Study Area Boundary',
    true
  );

  // Layer 4: Highest point (red marker)
  Map.addLayer(
    highestPoint,
    { color: 'FF3300', pointSize: 8 },
    'Highest Point',
    true
  );

  // Layer 5: Lowest point (blue marker)
  Map.addLayer(
    lowestPoint,
    { color: '0099FF', pointSize: 8 },
    'Lowest Point (Qattara)',
    true
  );

  // Layer 6: Below sea level overlay
  var seaLevel = copDEM.lt(0).selfMask();
  Map.addLayer(
    seaLevel,
    { palette: ['003366'], opacity: 0.35 },
    'Below Sea Level (< 0 m)',
    true
  );

  // Layer 7: Land use / land cover (ESA WorldCover 10 m, 2021)
  // Shown hidden by default — toggle on in the Layers panel to view
  Map.addLayer(
    worldCover,
    { min: 10, max: 100, palette: lcPalette },
    'Land Use / Land Cover (ESA WorldCover 2021)',
    false   // hidden by default so elevation is visible first
  );


  // ===========================================================================
  //  9. COMBINED LEGEND PANEL  (bottom-right)
  //     Land use section on top, elevation section below.
  //
  //  NOTE: verticalAlignment is not a valid GEE ui.Panel style property
  //        and has been removed. Row alignment is handled by the horizontal
  //        flow layout itself.
  // ===========================================================================
  var combinedLegend = ui.Panel({
    style: {
      position: 'bottom-right',
      padding: '10px 14px',
      backgroundColor: 'rgba(10,20,40,0.90)',
      border: '1px solid rgba(255,255,255,0.2)',
      width: '240px'
    }
  });

  // ── SECTION 1: Land Use / Land Cover ──────────────────────────────────────
  combinedLegend.add(ui.Label({
    value: 'Land Use / Land Cover',
    style: { fontWeight: 'bold', fontSize: '13px', color: '#000', margin: '0 0 2px 0' }
  }));
  combinedLegend.add(ui.Label({
    value: 'ESA WorldCover 2021 (10 m)',
    style: { fontSize: '10px', color: '#000', margin: '0 0 8px 0' }
  }));

  // One row per class: color swatch + label
  LC_CLASSES.forEach(function (cls) {
    var row = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: { margin: '2px 0' }   // verticalAlignment removed — not a valid GEE style prop
    });
    row.add(ui.Label({
      style: {
        backgroundColor: '#' + cls.color,
        padding: '6px',
        margin: '0 6px 0 0',
        border: '1px solid rgba(255,255,255,0.15)'
      }
    }));
    row.add(ui.Label({
      value: cls.label,
      style: { fontSize: '11px', color: '#000', margin: '0' }
    }));
    combinedLegend.add(row);
  });

  // ── Divider ───────────────────────────────────────────────────────────────
  combinedLegend.add(ui.Label({
    value: ' ',
    style: { margin: '6px 0 0 0' }
  }));
  combinedLegend.add(ui.Label({
    value: '──────────────────────────',
    style: { fontSize: '9px', color: '#555', margin: '0 0 8px 0' }
  }));

  // ── SECTION 2: Elevation ──────────────────────────────────────────────────
  combinedLegend.add(ui.Label({
    value: 'Elevation — NW Egypt',
    style: { fontWeight: 'bold', fontSize: '13px', color: '#000', margin: '0 0 2px 0' }
  }));
  combinedLegend.add(ui.Label({
    value: 'Marsa Matruh Gov. + Qattara Depression',
    style: { fontSize: '10px', color: '#000', margin: '0 0 6px 0' }
  }));

  // Elevation color bar
  combinedLegend.add(ui.Thumbnail({
    image: ee.Image.pixelLonLat().select(0),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '210x20',
      format: 'png',
      min: 0, max: 1,
      palette: elevPalette
    },
    style: { stretch: 'horizontal', margin: '2px 0', maxHeight: '20px' }
  }));

  // Min / Max labels
  combinedLegend.add(ui.Panel({
    widgets: [
      ui.Label({
        value: minVal.toFixed(0) + ' m',
        style: { fontSize: '10px', color: '#6baed6', fontWeight: 'bold' }
      }),
      ui.Label({
        value: maxVal.toFixed(0) + ' m',
        style: {
          fontSize: '10px', color: '#f03b20', fontWeight: 'bold',
          textAlign: 'right'
        }
      })
    ],
    layout: ui.Panel.Layout.flow('horizontal'),
    style: { stretch: 'horizontal', margin: '2px 0 8px 0' }
  }));

  // Key point labels
  var featureLabel = function (text, color) {
    return ui.Label({
      value: text,
      style: { fontSize: '11px', color: color, margin: '2px 0' }
    });
  };

  combinedLegend.add(featureLabel('Highest Point: ' + maxVal.toFixed(0) + ' m', '#FF5533'));
  combinedLegend.add(featureLabel('Lowest Point: ' + minVal.toFixed(0) + ' m (Qattara)', '#33AAFF'));
  combinedLegend.add(featureLabel('Below Sea Level overlay', '#4488aa'));

  Map.add(combinedLegend);

}); // end stats.evaluate()


// =============================================================================
//  11. OPTIONAL EXPORTS TO GOOGLE DRIVE
//      Set CONFIG.exportToDrive = true then re-run to queue export tasks.
// =============================================================================
if (CONFIG.exportToDrive) {

  // Export DEM raster
  Export.image.toDrive({
    image: copDEM,
    description: CONFIG.exportDEM,
    folder: CONFIG.exportFolderName,
    fileNamePrefix: CONFIG.exportDEM,
    region: geometry,
    scale: CONFIG.exportScale,
    crs: 'EPSG:4326',
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });
  print('DEM export queued:', CONFIG.exportDEM);

  // Export land use raster (10 m — use scale:10 for full res, or higher for speed)
  Export.image.toDrive({
    image: worldCover,
    description: CONFIG.exportLandUse,
    folder: CONFIG.exportFolderName,
    fileNamePrefix: CONFIG.exportLandUse,
    region: geometry,
    scale: 30,           // 30 m is a practical size; use 10 for full res
    crs: 'EPSG:4326',
    maxPixels: 1e13,
    fileFormat: 'GeoTIFF'
  });
  print('Land use export queued:', CONFIG.exportLandUse);

  print('Check the Tasks tab (top-right in GEE) to confirm and start exports.');
}


// =============================================================================
//  NOTES
// =============================================================================
print('');
print('Toggle layers using the checkboxes in the Layers panel (top-right map).');
print('The Qattara Depression reaches approx. -133 m — visible as the blue overlay.');
print('Set CONFIG.exportToDrive = true to export the DEM as a GeoTIFF to Drive.');
