import {
  closeCampaignWorker,
  initializeCampaignWorker,
} from "./campaign.worker";


//--------------------------------------------------
// Worker Initialization State
//--------------------------------------------------

let workersInitialized =
  false;


//--------------------------------------------------
// Initialize All Workers
//--------------------------------------------------

export function initializeWorkers():
  void {

  if (
    workersInitialized
  ) {

    console.log(
      "Background workers already initialized"
    );

    return;

  }


  initializeCampaignWorker();


  workersInitialized =
    true;


  console.log(
    "Background workers initialized"
  );

}


//--------------------------------------------------
// Close All Workers
//--------------------------------------------------

export async function closeWorkers():
  Promise<void> {

  if (
    !workersInitialized
  ) {

    console.log(
      "Background workers are not initialized"
    );

    return;

  }


  await closeCampaignWorker();


  workersInitialized =
    false;


  console.log(
    "Background workers closed"
  );

}