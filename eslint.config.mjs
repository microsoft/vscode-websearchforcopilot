import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import headersPlugin from 'eslint-plugin-headers';

const copyrightHeaderContent = `Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License. See LICENSE in the project root for license information.`;

export default [
	{
		ignores: ['out', 'dist', '**/*.d.ts'],
	},
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: 6,
			sourceType: 'module',
		},
		plugins: {
			'@typescript-eslint': tsEslintPlugin,
			headers: headersPlugin,
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					selector: 'import',
					format: ['camelCase', 'PascalCase'],
				},
			],
			'headers/header-format': ['error', {
				source: 'string',
				content: copyrightHeaderContent,
				blockPrefix: '---------------------------------------------------------------------------------------------\n',
				linePrefix: ' *  ',
				blockSuffix: '\n *--------------------------------------------------------------------------------------------',
			}],
			curly: 'warn',
			eqeqeq: 'warn',
			'no-throw-literal': 'warn',
			semi: 'warn',
		},
	},
];
