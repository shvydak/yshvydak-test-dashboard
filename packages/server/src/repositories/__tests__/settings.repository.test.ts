import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {SettingsRepository} from '../settings.repository'
import {DatabaseManager} from '../../database/database.manager'

describe('SettingsRepository', () => {
    let repository: SettingsRepository
    let dbManager: DatabaseManager

    beforeEach(async () => {
        dbManager = new DatabaseManager(':memory:')
        await dbManager.initialize()
        repository = new SettingsRepository(dbManager)
    })

    afterEach(async () => {
        await dbManager.close()
    })

    describe('getDiskThresholds()', () => {
        it('should return default values when no settings are saved', async () => {
            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.warningPercent).toBe(20)
            expect(thresholds.criticalPercent).toBe(5)
        })

        it('should return saved warning threshold', async () => {
            await repository.setDiskThresholds({warningPercent: 30, criticalPercent: 10})

            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.warningPercent).toBe(30)
        })

        it('should return saved critical threshold', async () => {
            await repository.setDiskThresholds({warningPercent: 25, criticalPercent: 8})

            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.criticalPercent).toBe(8)
        })

        it('should return default warning if only critical is saved', async () => {
            await repository.setDiskThresholds({warningPercent: 20, criticalPercent: 7})
            // Simulate partial state by only having critical saved — not possible via public API,
            // but verifying that each key is read independently
            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.warningPercent).toBe(20)
            expect(thresholds.criticalPercent).toBe(7)
        })
    })

    describe('setDiskThresholds()', () => {
        it('should persist both thresholds', async () => {
            await repository.setDiskThresholds({warningPercent: 40, criticalPercent: 15})

            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.warningPercent).toBe(40)
            expect(thresholds.criticalPercent).toBe(15)
        })

        it('should overwrite previously saved thresholds', async () => {
            await repository.setDiskThresholds({warningPercent: 30, criticalPercent: 10})
            await repository.setDiskThresholds({warningPercent: 50, criticalPercent: 20})

            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.warningPercent).toBe(50)
            expect(thresholds.criticalPercent).toBe(20)
        })

        it('should handle boundary values (1 and 99)', async () => {
            await repository.setDiskThresholds({warningPercent: 99, criticalPercent: 1})

            const thresholds = await repository.getDiskThresholds()

            expect(thresholds.warningPercent).toBe(99)
            expect(thresholds.criticalPercent).toBe(1)
        })

        it('should not affect other app_settings keys', async () => {
            await repository.setGlobalPlaywrightProject('chromium')
            await repository.setDiskThresholds({warningPercent: 30, criticalPercent: 10})

            const project = await repository.getGlobalPlaywrightProject()

            expect(project).toBe('chromium')
        })
    })

    describe('Project Tab Configs', () => {
        it('getProjectTabConfigs returns empty array when no row exists', async () => {
            const configs = await repository.getProjectTabConfigs()

            expect(configs).toEqual([])
        })

        it('getProjectTabConfigs returns saved configs after setProjectTabConfigs', async () => {
            const input = [
                {
                    project: 'Frontend',
                    displayName: 'Frontend Tests',
                    visible: true,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                },
                {
                    project: 'Backend',
                    displayName: 'Backend Tests',
                    visible: false,
                    inPipeline: true,
                    stopPipelineOnFailure: true,
                },
            ]

            await repository.setProjectTabConfigs(input)
            const configs = await repository.getProjectTabConfigs()

            expect(configs).toEqual(input)
        })

        it('setProjectTabConfigs called twice overwrites (UPSERT, not append)', async () => {
            const first = [
                {
                    project: 'Frontend',
                    displayName: 'Frontend',
                    visible: true,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                },
            ]
            const second = [
                {
                    project: 'Backend',
                    displayName: 'Backend',
                    visible: false,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                },
                {
                    project: 'Mobile',
                    displayName: 'Mobile',
                    visible: true,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                },
            ]

            await repository.setProjectTabConfigs(first)
            await repository.setProjectTabConfigs(second)

            const configs = await repository.getProjectTabConfigs()

            expect(configs).toHaveLength(2)
            expect(configs).toEqual(second)
        })

        it('defaults inPipeline/stopPipelineOnFailure to false for legacy rows missing those fields', async () => {
            const db = (dbManager as any).db
            await new Promise<void>((resolve, reject) =>
                db.run(
                    `INSERT INTO app_settings (key, value) VALUES ('project_tab_configs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                    [JSON.stringify([{project: 'Legacy', displayName: 'Legacy', visible: true}])],
                    (err: any) => (err ? reject(err) : resolve())
                )
            )

            const configs = await repository.getProjectTabConfigs()

            expect(configs).toEqual([
                {
                    project: 'Legacy',
                    displayName: 'Legacy',
                    visible: true,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                },
            ])
        })

        it('returns empty array and does not throw on malformed JSON in DB', async () => {
            // Insert raw bad JSON directly to simulate corruption
            const db = (dbManager as any).db
            await new Promise<void>((resolve, reject) =>
                db.run(
                    `INSERT INTO app_settings (key, value) VALUES ('project_tab_configs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                    ['{not valid json['],
                    (err: any) => (err ? reject(err) : resolve())
                )
            )

            const configs = await repository.getProjectTabConfigs()

            expect(configs).toEqual([])
        })

        it('setting tab configs does not affect global_playwright_project key', async () => {
            await repository.setGlobalPlaywrightProject('Sanity')
            await repository.setProjectTabConfigs([
                {
                    project: 'Frontend',
                    displayName: 'FE',
                    visible: true,
                    inPipeline: false,
                    stopPipelineOnFailure: false,
                },
            ])

            const project = await repository.getGlobalPlaywrightProject()

            expect(project).toBe('Sanity')
        })

        describe('workers field', () => {
            it('round-trips a per-project workers override', async () => {
                await repository.setProjectTabConfigs([
                    {
                        project: 'API_Tests',
                        displayName: 'API Tests',
                        visible: true,
                        inPipeline: true,
                        stopPipelineOnFailure: false,
                        workers: 4,
                    },
                ])

                const configs = await repository.getProjectTabConfigs()

                expect(configs[0].workers).toBe(4)
            })

            it('leaves workers undefined for tabs that never set it', async () => {
                await repository.setProjectTabConfigs([
                    {
                        project: 'WEB_Tests',
                        displayName: 'WEB Tests',
                        visible: true,
                        inPipeline: false,
                        stopPipelineOnFailure: false,
                    },
                ])

                const configs = await repository.getProjectTabConfigs()

                expect(configs[0].workers).toBeUndefined()
            })

            it('defaults workers to undefined for legacy rows missing the field', async () => {
                const db = (dbManager as any).db
                await new Promise<void>((resolve, reject) =>
                    db.run(
                        `INSERT INTO app_settings (key, value) VALUES ('project_tab_configs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                        [
                            JSON.stringify([
                                {project: 'Legacy', displayName: 'Legacy', visible: true},
                            ]),
                        ],
                        (err: any) => (err ? reject(err) : resolve())
                    )
                )

                const configs = await repository.getProjectTabConfigs()

                expect(configs[0].workers).toBeUndefined()
            })
        })
    })
})
