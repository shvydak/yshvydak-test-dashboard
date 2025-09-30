import fs from 'fs'
import path from 'path'
import {config} from '../config/environment.config'

export class FileUtil {
    static ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, {recursive: true})
        }
    }

    static getFileSize(filePath: string): number {
        try {
            const stats = fs.statSync(filePath)
            return stats.size
        } catch (error) {
            return 0
        }
    }

    static fileExists(filePath: string): boolean {
        return fs.existsSync(filePath)
    }

    static readJsonFile(filePath: string): any {
        try {
            const content = fs.readFileSync(filePath, 'utf-8')
            return JSON.parse(content)
        } catch (error) {
            throw new Error(`Failed to read JSON file: ${filePath}`)
        }
    }

    static convertToRelativeUrl(absolutePath: string): string {
        return absolutePath
            .replace(config.playwright.projectDir, '')
            .replace(/^\//, '') // Remove leading slash
            .replace(/\\/g, '/') // Convert Windows paths
    }

    static mapContentTypeToDbType(
        contentType: string,
        fileName: string
    ): 'video' | 'screenshot' | 'trace' | 'log' {
        // Video files
        if (
            contentType.startsWith('video/') ||
            fileName.endsWith('.webm') ||
            fileName.endsWith('.mp4')
        ) {
            return 'video'
        }

        // Screenshot files
        if (
            contentType.startsWith('image/') ||
            fileName.endsWith('.png') ||
            fileName.endsWith('.jpg') ||
            fileName.endsWith('.jpeg')
        ) {
            return 'screenshot'
        }

        // Trace files
        if (contentType.includes('zip') || fileName.endsWith('.zip')) {
            return 'trace'
        }

        // Text/log files
        if (
            contentType.startsWith('text/') ||
            fileName.endsWith('.log') ||
            fileName.endsWith('.txt')
        ) {
            return 'log'
        }

        // Fallback based on common attachment names from Playwright
        if (fileName === 'video') return 'video'
        if (fileName === 'screenshot') return 'screenshot'
        if (fileName === 'trace') return 'trace'

        return 'log' // Default fallback
    }
}
