// Central job scheduler. Started once after DB connection confirmed.
// All jobs self-register their cron schedules via their start() method.
// SIGTERM handler calls scheduler.stopAll() for graceful shutdown.

import { PrismaClient }        from '@prisma/client'
import { ReverificationJob }   from './ReverificationJob'
import { NotamPollJob }        from './NotamPollJob'
import { MetarPollJob }        from './MetarPollJob'
import { AdcFicPollJob }       from './AdcFicPollJob'
import { JeppesenPollJob }     from './JeppesenPollJob'
import { AAIDataSyncJob }      from './AAIDataSyncJob'
import { AnnualReconfirmJob }  from './AnnualReconfirmJob'
import { EvidenceLedgerJob }   from './EvidenceLedgerJob'
import { CredentialSyncJob }   from './CredentialSyncJob'
import { createServiceLogger } from '../logger'

const log = createServiceLogger('JobScheduler')

interface Job {
  start(): void
  stop():  void
}

export class JobScheduler {
  private readonly jobs: Record<string, Job>

  constructor(private readonly prisma: PrismaClient) {
    this.jobs = {
      reverification:  new ReverificationJob(prisma),
      notamPoll:       new NotamPollJob(prisma),          // Daily — ONE_WAY import
      metarPoll:       new MetarPollJob(prisma),           // 30 min — ONE_WAY import
      adcFicPoll:      new AdcFicPollJob(prisma),          // 1 min — TWO_WAY (ADC + FIC)
      jeppesenPoll:    new JeppesenPollJob(prisma),        // Daily — ONE_WAY import
      aaiDataSync:     new AAIDataSyncJob(prisma),         // Daily — TWO_WAY
      annualReconfirm: new AnnualReconfirmJob(prisma),
      evidenceLedger:  new EvidenceLedgerJob(prisma),
      credentialSync:  new CredentialSyncJob(prisma),      // Daily — TWO_WAY
    }
  }

  startAll(): void {
    log.info('job_scheduler_starting_all', { data: { jobs: Object.keys(this.jobs) } })
    for (const [name, job] of Object.entries(this.jobs)) {
      try {
        job.start()
        log.info('job_started', { data: { job: name } })
      } catch (e) {
        log.error('job_start_failed', {
          data: { job: name, error: e instanceof Error ? e.message : String(e) }
        })
      }
    }
  }

  stopAll(): void {
    for (const job of Object.values(this.jobs)) {
      try { job.stop() } catch { /* ignore stop errors during shutdown */ }
    }
    log.info('job_scheduler_all_stopped', {})
  }

  // Expose individual jobs for testing
  getJobs() { return this.jobs }
}
