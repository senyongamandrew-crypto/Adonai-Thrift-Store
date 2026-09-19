import { configApp } from '@adonisjs/eslint-config'

export default [
  ...configApp(),
  { ignores: ['AdonaiPOS/**', 'node_modules/**', 'build/**', 'tmp/**'] },
]
