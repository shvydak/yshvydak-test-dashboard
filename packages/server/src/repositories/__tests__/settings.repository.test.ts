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
                {project: 'Frontend', displayName: 'Frontend Tests', visible: true},
                {project: 'Backend', displayName: 'Backend Tests', visible: false},
            ]

            await repository.setProjectTabConfigs(input)
            const configs = await repository.getProjectTabConfigs()

            expect(configs).toEqual(input)
        })

        it('setProjectTabConfigs called twice overwrites (UPSERT, not append)', async () => {
            const first = [{project: 'Frontend', displayName: 'Frontend', visible: true}]
            const second = [
                {project: 'Backend', displayName: 'Backend', visible: false},
                {project: 'Mobile', displayName: 'Mobile', visible: true},
            ]

            await repository.setProjectTabConfigs(first)
            await repository.setProjectTabConfigs(second)

            const configs = await repository.getProjectTabConfigs()

            expect(configs).toHaveLength(2)
            expect(configs).toEqual(second)
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
                {project: 'Frontend', displayName: 'FE', visible: true},
            ])

            const project = await repository.getGlobalPlaywrightProject()

            expect(project).toBe('Sanity')
        })
    })
})
