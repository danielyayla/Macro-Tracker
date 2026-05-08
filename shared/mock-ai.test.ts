import { expect, test } from 'vitest'
import { parseMockToolCommand } from './mock-ai.ts'

test('parseMockToolCommand returns null for non-tool messages', () => {
	expect(parseMockToolCommand('help')).toBeNull()
})

test('parseMockToolCommand parses basic scalar values', () => {
	expect(
		parseMockToolCommand(
			'tool:log_food;name=Avocado;kcal=240;fat_g=22;carbs_g=12',
		),
	).toEqual({
		toolName: 'log_food',
		input: {
			name: 'Avocado',
			kcal: 240,
			fat_g: 22,
			carbs_g: 12,
		},
	})
})

test('parseMockToolCommand parses booleans and null', () => {
	expect(
		parseMockToolCommand('tool:example;flag=true;missing=null;label=test'),
	).toEqual({
		toolName: 'example',
		input: {
			flag: true,
			missing: null,
			label: 'test',
		},
	})
})
