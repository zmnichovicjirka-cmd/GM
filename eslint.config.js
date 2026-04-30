import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  firebaseRulesPlugin.configs['flat/recommended'],
  {
    files: ["**/*.rules"],
    rules: {
      // Add custom overrides if needed
    }
  },
  {
    ignores: ["dist/**", "node_modules/**"]
  }
];
