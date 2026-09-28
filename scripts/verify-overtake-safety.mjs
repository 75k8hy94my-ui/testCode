import overtake from '../game/traffic-overtake.js';

const common = {
  roadWidth:214,
  carHalfWidth:18,
  currentOffset:20,
  obstacleDistance:200,
  planningSpeed:85
};
const approaching = overtake.plan({
  ...common,
  opposingVehicles:[{ distance:600,speed:90,halfLength:38 }]
});
const passed = overtake.plan({
  ...common,
  opposingVehicles:[{ distance:-90,speed:90,halfLength:38 }]
});
const clearRoad = overtake.plan({ ...common,opposingVehicles:[] });
const planAfterClearance = overtake.planForObstacle({
  ...common,
  vehicleHalfLength:30,
  obstacleLateral:20,
  obstacleHalfWidth:17,
  obstacleHalfLength:34,
  endpointDistance:1200,
  currentAlong:400,
  directionSign:1,
  opposingVehicles:[]
});
const result = { approaching,passed,clearRoad,planAfterClearance };
if (approaching !== null || !passed || !clearRoad || !planAfterClearance) {
  console.error(JSON.stringify(result,null,2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status:'passed',...result },null,2));
}
