import { DashboardRepository } from "./dashboard.repository";

export class DashboardService {

  static async getLiveDashboard(){

    const [

      activeCalls,

      queuedCalls,

      completedToday,

      failedToday

    ] = await Promise.all([

      DashboardRepository.activeCalls(),

      DashboardRepository.queuedCalls(),

      DashboardRepository.completedToday(),

      DashboardRepository.failedToday()

    ]);

    return {

      activeCalls,

      queuedCalls,

      completedToday,

      failedToday

    };

  }

  static async getTimeline(){

    return DashboardRepository.getTimeline();

  }

  static async getActiveCalls(){

    return DashboardRepository.getActiveCalls();

  }

}