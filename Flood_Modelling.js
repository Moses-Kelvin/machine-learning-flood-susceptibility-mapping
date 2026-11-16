Map.centerObject(studyArea, 10);

// ==============================
// Sentinel-1 Data Acquisition
// ==============================
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(studyArea)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.eq('resolution_meters', 10))
  .select('VV');

// ==============================
// Pre- and Post-Flood Composites
// ==============================
var preFlood = s1
  .filterDate('2023-05-01', '2023-06-20')
  .median()
  .clip(studyArea);

var postFlood = s1
  .filterDate('2023-07-01', '2023-08-10')
  .median()
  .clip(studyArea);

Map.addLayer(preFlood, {min: -25, max: 0}, 'Pre-Flood VV');
Map.addLayer(postFlood, {min: -25, max: 0}, 'Post-Flood VV');

// ==============================
// Change Detection
// ==============================
var change = postFlood.subtract(preFlood);

Map.addLayer(change, {min: -5, max: 5}, 'Backscatter Change');

Export.image.toDrive({
  image: change,
  description: 'BackScattter',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'BackScattter',
  region: studyArea,
  scale: 10,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

// Use percentile-based threshold
var thresh = change.reduceRegion({
  reducer: ee.Reducer.percentile([10]),
  geometry: studyArea,
  scale: 10,
  maxPixels: 1e13
}).getNumber('VV');

var flood = change.lt(thresh).selfMask();

// ==============================
// Flood Extraction
// ==============================
// var flood = change.lt(-1.0).selfMask();

// Force single band
flood = flood.select(0);

// ==============================
// Flood Refinement
// ==============================

// Remove permanent water
var permanentWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .gt(90);

flood = flood.updateMask(permanentWater.not());

// Remove steep slopes
var dem = ee.Image('USGS/SRTMGL1_003');
var slope = ee.Terrain.slope(dem);

flood = flood.updateMask(slope.lt(10));

// Remove isolated pixels
var connectivity = flood.connectedPixelCount(8, true);
flood = flood.updateMask(connectivity.gte(3));


// Rename final flood band
flood = flood.rename('flood');

Map.addLayer(flood, {palette: ['00FFFF']}, 'Final Flood Extent');

// ==============================
// Export Results
// ==============================
var floodFinal = flood.clip(studyArea);

Export.image.toDrive({
  image: floodFinal,
  description: 'Flood_Extent_Sentinel1_IkpobaOkha',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'Flood_Extent_S1_IkpobaOkha',
  region: studyArea,
  scale: 10,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: preFlood,
  description: 'PreFlood_Sentinel1_VV',
  folder: 'GEE_Flood_Results',
  scale: 10,
  region: studyArea,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: postFlood,
  description: 'PostFlood_Sentinel1_VV',
  folder: 'GEE_Flood_Results',
  scale: 10,
  region: studyArea,
  maxPixels: 1e13
});

// Conditioning factors
var dem = ee.Image('USGS/SRTMGL1_003')
  .clip(studyArea);

var elevation = dem;

Map.addLayer(
  elevation,
  {min: 0, max: 100, palette: ['blue', 'green', 'yellow', 'red']},
  'Elevation'
);

var slope = ee.Terrain.slope(dem);

Map.addLayer(
  slope,
  {min: 0, max: 10, palette: ['blue', 'green', 'yellow', 'red']},
  'Slope (degrees)'
);

var merit = ee.Image('MERIT/Hydro/v1_0_1')
  .clip(studyArea);

// Upstream area (flow accumulation proxy)
var flowAcc = merit.select('upa');

Map.addLayer(
  flowAcc,
  {min: 0, max: 5000},
  'Flow Accumulation (MERIT)'
);

var streams = flowAcc.gt(300).selfMask();


Map.addLayer(
  streams,
  {palette: ['blue']},
  'Drainage Network'
);

var maxFlowAcc = flowAcc.reduceRegion({
  reducer: ee.Reducer.max(),
  geometry: studyArea,
  scale: 90,
  maxPixels: 1e9
}).get('upa');

var drainageDensity = flowAcc.divide(ee.Number(maxFlowAcc));

Map.addLayer(
  drainageDensity,
  {min: 0, max: 1},
  'Drainage Density (Normalized)'
);

var lulc = ee.Image('ESA/WorldCover/v100/2020')
  .select('Map')
  .clip(studyArea);

Map.addLayer(
  lulc,
  {},
  'LULC (ESA WorldCover)'
);


// Slope in degrees
var slopeDeg = ee.Terrain.slope(dem);

// Convert slope to radians
var slopeRad = slopeDeg.multiply(Math.PI).divide(180);

// Avoid zero slope
var slopeSafe = slopeRad.where(slopeRad.lte(0.001), 0.001);

// Avoid zero flow accumulation
var flowAccSafe = flowAcc.where(flowAcc.lte(1), 1);

var twi = flowAccSafe
  .divide(slopeSafe.tan())
  .log()
  .rename('TWI');

Map.addLayer(
  twi,
  {
    min: 2,
    max: 15,
    palette: ['blue', 'cyan', 'yellow', 'red']
  },
  'Topographic Wetness Index (TWI)'
);

var twiCapped = twi
  .clamp(2, 15);

Map.addLayer(
  twiCapped,
  {
    min: 2,
    max: 15,
    palette: ['blue', 'cyan', 'yellow', 'red']
  },
  'TWI (Capped)'
);

 // Exporting conditioning factors
Export.image.toDrive({
  image: elevation,
  description: 'Elevation_IkpobaOkha_30m',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'Elevation_IkpobaOkha_30m',
  region: studyArea,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: slope,
  description: 'Slope_IkpobaOkha_30m',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'Slope_IkpobaOkha_30m',
  region: studyArea,
  scale: 30,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: flowAcc,
  description: 'FlowAccumulation_IkpobaOkha_90m',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'FlowAccumulation_IkpobaOkha_90m',
  region: studyArea,
  scale: 90,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: drainageDensity,
  description: 'DrainageDensity_IkpobaOkha_90m',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'DrainageDensity_IkpobaOkha_90m',
  region: studyArea,
  scale: 90,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: twiCapped,
  description: 'TWI_IkpobaOkha_90m',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'TWI_IkpobaOkha_90m',
  region: studyArea,
  scale: 90,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: lulc,
  description: 'LULC_IkpobaOkha_10m',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'LULC_IkpobaOkha_10m',
  region: studyArea,
  scale: 10,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});

// Final flood inventory (10 m, binary)
var floodInventory = floodFinal
  .unmask(0)
  .rename('flood')
  .setDefaultProjection({
    crs: preFlood.projection().crs(),
    scale: 10
  });

Map.addLayer(
  floodInventory.updateMask(floodInventory.eq(1)),
  {palette: ['cyan']},
  'Flood Inventory (Flood Pixels Only)'
);


var predictors = ee.Image.cat([
  elevation.rename('elevation'),
  slope.rename('slope'),
  flowAcc.rename('flowAcc'),
  drainageDensity.rename('drainDen'),
  twiCapped.rename('twi'),
  lulc.rename('lulc')
]).clip(studyArea);

// Stack predictors + target
var modelImage = predictors.addBands(floodInventory);

var samples = modelImage.stratifiedSample({
  numPoints: 600,          // per class
  classBand: 'flood',
  classValues: [0, 1],
  classPoints: [600, 600], // perfectly balanced
  region: studyArea,
  scale: 10,
  seed: 42,
  geometries: true
});

print('Sample class distribution', samples.aggregate_histogram('flood'));

// Check class balance
print('Sample class distribution', samples.aggregate_histogram('flood'));

// Train / validation split
var samplesWithRandom = samples.randomColumn('random');
var trainingSamples = samplesWithRandom.filter('random < 0.7');
var validationSamples = samplesWithRandom.filter('random >= 0.7');


var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: 300,
  minLeafPopulation: 5,
  bagFraction: 0.7,
  seed: 42
}).train({
  features: trainingSamples,
  classProperty: 'flood',
  inputProperties: predictors.bandNames()
});


var validated = validationSamples.classify(rf);

var confusionMatrix = validated.errorMatrix('flood', 'classification');
print('Confusion Matrix', confusionMatrix);
print('Overall Accuracy', confusionMatrix.accuracy());
print('Kappa Coefficient', confusionMatrix.kappa());


var rfProb = ee.Classifier.smileRandomForest({
  numberOfTrees: 300,
  seed: 42
})
.setOutputMode('PROBABILITY')
.train({
  features: trainingSamples,
  classProperty: 'flood',
  inputProperties: predictors.bandNames()
});

var floodSusceptibility = predictors.classify(rfProb);


Map.addLayer(
  floodSusceptibility,
  {
    min: 0,
    max: 1,
    palette: ['blue', 'cyan', 'yellow', 'orange', 'red']
  },
  'Flood Susceptibility (RF Probability)'
);

 var susceptibilityClass = floodSusceptibility
  .expression(
    "(b < 0.2) ? 1" +
    ": (b < 0.4) ? 2" +
    ": (b < 0.6) ? 3" +
    ": (b < 0.8) ? 4" +
    ": 5", {
      'b': floodSusceptibility
    }
  )
  .rename('FSI_Class')
  .updateMask(floodSusceptibility)
  .clip(studyArea);


Map.addLayer(
  susceptibilityClass,
  {
    min: 1,
    max: 5,
    palette: ['blue', 'green', 'yellow', 'orange', 'red']
  },
  'Flood Susceptibility Classes'
);

Export.image.toDrive({
  image: susceptibilityClass,
  description: 'Flood_Susceptibility_RF_IkpobaOkha',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'Flood_Susceptibility_RF_IkpobaOkha',
  region: studyArea,
  scale: 10,
  crs: 'EPSG:32631',
  maxPixels: 1e13
});


print(
  'Flood pixels count',
  floodInventory.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: studyArea,
    scale: 10,
    maxPixels: 1e13
  })
);

print(
  'Flood class histogram',
  samples.aggregate_histogram('flood')
);

// Add susceptibility probability to validation points
var validationWithProb = floodSusceptibility.sampleRegions({
  collection: validationSamples,
  properties: ['flood'],
  scale: 10
});

var floodPts = validationWithProb.filter(ee.Filter.eq('flood', 1));
var nonFloodPts = validationWithProb.filter(ee.Filter.eq('flood', 0));

var auc = floodPts.map(function(f) {
  var pFlood = ee.Number(f.get('classification'));

  var comparisons = nonFloodPts.map(function(nf) {
    var pNonFlood = ee.Number(nf.get('classification'));

    return ee.Feature(null, {
      'score': pFlood.gt(pNonFlood)
        .add(pFlood.eq(pNonFlood).multiply(0.5))
    });
  });

  return comparisons;
}).flatten()
  .reduceColumns({
    reducer: ee.Reducer.mean(),
    selectors: ['score']
  })
  .get('mean');

print('ROC–AUC Value', auc);

// Random Forest variable importance
var importance = ee.Dictionary(rf.explain().get('importance'));

print('Random Forest Variable Importance', importance);

var totalImportance = importance.values().reduce(ee.Reducer.sum());

var importancePercent = importance.map(function(key, value) {
  return ee.Number(value).divide(totalImportance).multiply(100);
});

print('Variable Importance (%)', importancePercent);


 // Convert importance dictionary to FeatureCollection
var importanceFC = ee.FeatureCollection(
  importance.keys().map(function(key) {
    return ee.Feature(null, {
      variable: key,
      importance: importance.get(key)
    });
  })
);

// Plot variable importance
var importanceChart = ui.Chart.feature.byFeature({
  features: importanceFC,
  xProperty: 'variable',
  yProperties: ['importance']
})
.setChartType('ColumnChart')
.setOptions({
  title: 'Random Forest Variable Importance',
  hAxis: {title: 'Conditioning Factors'},
  vAxis: {title: 'Importance'},
  legend: {position: 'none'}
});

print(importanceChart);


// Prepare ROC data for export
var rocExport = validationWithProb.map(function(f) {
  return ee.Feature(null, {
    probability: f.get('classification'),
    observed: f.get('flood')
  });
});

Export.table.toDrive({
  collection: rocExport,
  description: 'ROC_Data_Flood_RF',
  folder: 'GEE_Flood_Results',
  fileNamePrefix: 'ROC_Data_Flood_RF',
  fileFormat: 'CSV'
});
