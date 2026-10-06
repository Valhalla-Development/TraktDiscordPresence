import { expect, test } from 'bun:test';
import braces from 'braces';

test('patched brace parser rejects deeply nested patterns and preserves ordinary globs', () => {
    const nested = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
    expect(() => braces(nested)).toThrow('safe depth limit');
    expect(() => braces.expand(nested)).toThrow('safe depth limit');
    expect(braces.expand('src/{services,utils}/*.ts')).toEqual(['src/services/*.ts', 'src/utils/*.ts']);
    expect(braces.compile('{a,{b,c}}')).toBe('(a|(b|c))');
});

test('patched recursive walkers reject deeply nested caller-provided ASTs', () => {
    let ast = { type: 'text', value: 'x' };
    for (let index = 0; index < 500; index++) ast = { type: 'root', nodes: [ast] };
    expect(() => braces.compile(ast)).toThrow('safe depth limit');
    expect(() => braces.expand(ast)).toThrow('safe depth limit');
    expect(() => braces.stringify(ast)).toThrow('safe depth limit');
});
