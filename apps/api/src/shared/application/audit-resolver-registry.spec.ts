import { AuditResolverRegistry } from './audit-resolver-registry';

describe('AuditResolverRegistry', () => {
  it('returns undefined for unregistered types', () => {
    const reg = new AuditResolverRegistry();
    expect(reg.resolverFor('recipe')).toBeUndefined();
  });

  it('registers + resolves by aggregateType', () => {
    const reg = new AuditResolverRegistry();
    const fn = jest.fn().mockResolvedValue({ id: 'x' });
    reg.register('recipe', fn);
    const resolver = reg.resolverFor('recipe');
    expect(resolver).toBe(fn);
  });

  it('overwrites prior registration for the same type (last-write-wins)', () => {
    const reg = new AuditResolverRegistry();
    const a = jest.fn().mockResolvedValue('a');
    const b = jest.fn().mockResolvedValue('b');
    reg.register('recipe', a);
    reg.register('recipe', b);
    expect(reg.resolverFor('recipe')).toBe(b);
  });

  it('registeredTypes() reports all registered keys', () => {
    const reg = new AuditResolverRegistry();
    reg.register('recipe', jest.fn());
    reg.register('menu_item', jest.fn());
    reg.register('ingredient', jest.fn());
    expect(reg.registeredTypes().sort()).toEqual([
      'ingredient',
      'menu_item',
      'recipe',
    ]);
  });
});
