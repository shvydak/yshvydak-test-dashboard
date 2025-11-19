import packageJson from '../../package.json'

export const VERSION = {
    web: packageJson.version,
    githubRepo: 'https://github.com/shvydak/yshvydak-test-dashboard',
    get releaseUrl() {
        // Before release link to CHANGELOG
        // After release update to releases/tag/dashboard-v${this.web}
        return `${this.githubRepo}/blob/main/packages/web/CHANGELOG.md`
        // return `${this.githubRepo}/releases/tag/dashboard-v${this.web}`
    },
    get changelogUrl() {
        return `${this.githubRepo}/blob/main/packages/web/CHANGELOG.md`
    },
}
