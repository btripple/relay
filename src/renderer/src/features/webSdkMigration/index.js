// Feature flag — set to false to completely hide Web SDK Migration from the UI
export const WEB_SDK_MIGRATION_ENABLED = true

export { analyzeAAMigration } from './parseAdobeAnalytics'
export { SCHEMA_OPTIONS, generateMappingRows } from './schemaStrategies'
export { exportMigrationExcel, importMigrationExcel } from './migrationExport'
export { default as MigrationWizard } from './MigrationWizard'
