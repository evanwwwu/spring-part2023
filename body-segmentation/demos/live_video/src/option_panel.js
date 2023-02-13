
import * as params from './shared/params';
let controllers = {};
export async function setupDatGui() {
  const gui = new dat.GUI({width: 300});
  gui.domElement.id = 'gui';

  const backendFolder = gui.addFolder('Backend');
  // showBackendConfigs(backendFolder);

  controllers['scale'] = backendFolder.add(params.STATE.backend, 'scale')
    .min(-3)
    .max(3)
    .step(0.001)
  
  controllers['offsetX'] = backendFolder.add(params.STATE.backend, 'offsetX')
    .min(-2000)
    .max(2000)
  .step(0.1);
  
  controllers['offsetY'] = backendFolder.add(params.STATE.backend, 'offsetY')
    .min(-2000)
    .max(2000)
    .step(0.1);
  
  controllers['count'] = backendFolder.add(params.STATE.backend, 'count')
  .min(1)
  .max(60)
  .step(1);

 controllers['row'] =  backendFolder.add(params.STATE.backend, 'row')
  .min(1)
  .max(10)
  .step(1);
  controllers['spaceX'] = backendFolder.add(params.STATE.backend, 'spaceX')
  .min(0)
  .max(500)
  .step(1);
  controllers['spaceY'] = backendFolder.add(params.STATE.backend, 'spaceY')
  .min(0)
  .max(500)
    .step(1);
  
  controllers['fontSize'] = backendFolder.add(params.STATE.backend, 'fontSize')
  .min(1)
  .max(30)
  .step(1);
  
  backendFolder.open();
  return gui;
}

export function setControllers(prop, value){
  controllers[prop].setValue(value)
}

export function getController(prop) {
  return controllers[prop]
}

async function showBackendConfigs(folderController) {

  const backends = params.MODEL_BACKEND_MAP[params.STATE.model];
  // The first element of the array is the default backend for the model.
  params.STATE.backend = backends[0];
  const backendController =
      folderController.add(params.STATE, 'backend', backends);
  backendController.name('runtime-backend');
  backendController.onChange(async backend => {
    params.STATE.isBackendChanged = true;
    await showFlagSettings(folderController, backend);
  });
  await showFlagSettings(folderController, params.STATE.backend);
}

