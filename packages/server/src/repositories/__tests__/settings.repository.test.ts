import {describe, it, expect, beforeEach, afterEach} from 'vitest'
import {SettingsRepository, ProjectTabConfig} from '../settings.repository'
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
            const input: ProjectTabConfig[] = [
                {
                    project: 'Frontend',
                    displayName: 'Frontend Tests',
                    visible: true,
                    pipelines: [],
                    stopPipelineOnFailure: false,
                },
                {
                    project: 'Backend',
                    displayName: 'Backend Tests',
                    visible: false,
                    pipelines: ['develop'],
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
                    pipelines: [],
                    stopPipelineOnFailure: false,
                },
            ]
            const second = [
                {
                    project: 'Backend',
                    displayName: 'Backend',
                    visible: false,
                    pipelines: [],
                    stopPipelineOnFailure: false,
                },
                {
                    project: 'Mobile',
                    displayName: 'Mobile',
                    visible: true,
                    pipelines: [],
                    stopPipelineOnFailure: false,
                },
            ]

            await repository.setProjectTabConfigs(first)
            await repository.setProjectTabConfigs(second)

            const configs = await repository.getProjectTabConfigs()

            expect(configs).toHaveLength(2)
            expect(configs).toEqual(second)
        })

        it('defaults pipelines to [] and stopPipelineOnFailure to false for legacy rows', async () => {
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
                    pipelines: [],
                    stopPipelineOnFailure: false,
                },
            ])
        })

        it('migrates legacy inPipeline:true rows to pipelines:["develop"]', async () => {
            const db = (dbManager as any).db
            await new Promise<void>((resolve, reject) =>
                db.run(
                    `INSERT INTO app_settings (key, value) VALUES ('project_tab_configs', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                    [
                        JSON.stringify([
                            {
                                project: 'CI',
                                displayName: 'CI',
                                visible: true,
                                inPipeline: true,
                            },
                        ]),
                    ],
                    (err: any) => (err ? reject(err) : resolve())
                )
            )

            const configs = await repository.getProjectTabConfigs()

            expect(configs[0].pipelines).toEqual(['develop'])
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
                    pipelines: [],
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
                        pipelines: ['develop'],
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
                        pipelines: [],
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

    describe('Default Project Tab', () => {
        it('getDefaultProjectTab returns empty string when no row exists', async () => {
            const project = await repository.getDefaultProjectTab()

            expect(project).toBe('')
        })

        it('getDefaultProjectTab returns saved value after setDefaultProjectTab', async () => {
            await repository.setDefaultProjectTab('API_Tests')

            const project = await repository.getDefaultProjectTab()

            expect(project).toBe('API_Tests')
        })

        it('setDefaultProjectTab overwrites previous value (UPSERT)', async () => {
            await repository.setDefaultProjectTab('API_Tests')
            await repository.setDefaultProjectTab('All_Tests')

            const project = await repository.getDefaultProjectTab()

            expect(project).toBe('All_Tests')
        })

        it('setDefaultProjectTab can clear to empty string', async () => {
            await repository.setDefaultProjectTab('API_Tests')
            await repository.setDefaultProjectTab('')

            const project = await repository.getDefaultProjectTab()

            expect(project).toBe('')
        })

        it('setting default project tab does not affect project_tab_configs', async () => {
            await repository.setProjectTabConfigs([
                {
                    project: 'API_Tests',
                    displayName: 'API',
                    visible: true,
                    pipelines: [],
                    stopPipelineOnFailure: false,
                },
            ])
            await repository.setDefaultProjectTab('API_Tests')

            const configs = await repository.getProjectTabConfigs()

            expect(configs).toHaveLength(1)
            expect(configs[0].project).toBe('API_Tests')
        })
    })

    describe('Jira settings', () => {
        const stored = (key: string, value: string) =>
            repository['execute']('INSERT INTO app_settings (key, value) VALUES (?, ?)', [
                key,
                value,
            ])

        it('should return defaults when nothing is saved', async () => {
            expect(await repository.getJiraSettings()).toEqual({
                baseUrl: '',
                chipAlignment: 'left',
                tagMode: 'tickets',
            })
        })

        it('should round-trip saved settings', async () => {
            await repository.setJiraSettings({
                baseUrl: 'https://x.atlassian.net/browse/',
                chipAlignment: 'right',
                tagMode: 'all',
            })

            expect(await repository.getJiraSettings()).toEqual({
                baseUrl: 'https://x.atlassian.net/browse/',
                chipAlignment: 'right',
                tagMode: 'all',
            })
        })

        it('should upsert: a second save overwrites the first', async () => {
            await repository.setJiraSettings({
                baseUrl: 'https://a.example/',
                chipAlignment: 'right',
                tagMode: 'all',
            })
            await repository.setJiraSettings({
                baseUrl: '',
                chipAlignment: 'left',
                tagMode: 'tickets',
            })

            expect(await repository.getJiraSettings()).toEqual({
                baseUrl: '',
                chipAlignment: 'left',
                tagMode: 'tickets',
            })
        })

        it('should round-trip the below alignment', async () => {
            await repository.setJiraSettings({
                baseUrl: '',
                chipAlignment: 'below',
                tagMode: 'tickets',
            })

            expect((await repository.getJiraSettings()).chipAlignment).toBe('below')
        })

        it('should fall back to left for an unknown stored alignment', async () => {
            await stored('chip_alignment', 'center')

            expect((await repository.getJiraSettings()).chipAlignment).toBe('left')
        })

        it('should store the tag mode under chip_tag_mode', async () => {
            await repository.setJiraSettings({baseUrl: '', chipAlignment: 'left', tagMode: 'all'})

            const row = await repository['queryOne']<{value: string}>(
                "SELECT value FROM app_settings WHERE key = 'chip_tag_mode'"
            )
            expect(row?.value).toBe('all')
        })

        it('should fall back to tickets for an unknown stored tag mode', async () => {
            await stored('chip_tag_mode', 'everything')

            expect((await repository.getJiraSettings()).tagMode).toBe('tickets')
        })

        it('should default tagMode to tickets when only the older keys are stored', async () => {
            await stored('jira_base_url', 'https://x.example/browse/')
            await stored('chip_alignment', 'below')

            expect(await repository.getJiraSettings()).toEqual({
                baseUrl: 'https://x.example/browse/',
                chipAlignment: 'below',
                tagMode: 'tickets',
            })
        })
    })
})
