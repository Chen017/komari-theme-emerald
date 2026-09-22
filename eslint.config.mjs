import antfu from '@antfu/eslint-config'

export default antfu({
  formatters: true,
  vue: true,
  ignores: [
    'komari_resource_insights_clean_refactor_plan.md',
  ],
})
