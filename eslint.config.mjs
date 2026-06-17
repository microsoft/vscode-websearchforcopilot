import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';

const copyrightHeader = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/`;

const headerPlugin = {
	rules: {
		header: {
			meta: {
				type: 'layout',
				fixable: 'whitespace',
				schema: [],
			},
			create(context) {
				return {
					Program(node) {
						const sourceCode = context.sourceCode ?? context.getSourceCode?.();
						const [firstComment] = sourceCode.getAllComments();
						const expectedHeader = `${copyrightHeader}\n`;

						if (
							firstComment &&
							firstComment.type === 'Block' &&
							firstComment.range[0] === 0 &&
							sourceCode.getText(firstComment) === copyrightHeader
						) {
							return;
						}

						context.report({
							node,
							loc: { line: 1, column: 0 },
							message: 'Missing expected file header comment.',
							fix(fixer) {
								if (firstComment && firstComment.range[0] === 0) {
									return fixer.replaceText(firstComment, copyrightHeader);
								}

								return fixer.insertTextBefore(node, expectedHeader);
							},
						});
					},
				};
			},
		},
	},
};

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
			header: headerPlugin,
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					selector: 'import',
					format: ['camelCase', 'PascalCase'],
				},
			],
			'header/header': 'error',
			curly: 'warn',
			eqeqeq: 'warn',
			'no-throw-literal': 'warn',
			semi: 'warn',
		},
	},
];
