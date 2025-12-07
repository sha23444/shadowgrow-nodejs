const assert = require('assert');
const { __test__ } = require('../controllers/user/cart');

const {
  getExclusiveTypesFromItems,
  buildModuleConflictResponse,
  deriveCartModuleType,
} = __test__;

function testGetExclusiveTypes () {
  const items = [
    { item_type: 1 },
    { item_type: 2 },
    { item_type: 2 },
    { item_type: 7 },
  ];
  const result = getExclusiveTypesFromItems(items);
  assert.deepStrictEqual(result, [1, 2], 'Should return unique exclusive types only');
}

function testConflictDetection () {
  const existing = [{ item_type: 1 }];
  const incoming = [{ item_type: 2 }];
  const conflict = buildModuleConflictResponse(
    getExclusiveTypesFromItems(existing),
    getExclusiveTypesFromItems(incoming)
  );
  assert.ok(conflict, 'Conflict should be detected between different module types');
  assert.strictEqual(conflict.currentType, 1);
  assert.strictEqual(conflict.attemptedType, 2);
}

function testNoConflictSameType () {
  const existing = [{ item_type: 1 }];
  const incoming = [{ item_type: 1 }];
  const conflict = buildModuleConflictResponse(
    getExclusiveTypesFromItems(existing),
    getExclusiveTypesFromItems(incoming)
  );
  assert.strictEqual(conflict, null, 'Same module type should not conflict');
}

function testDeriveModuleType () {
  const items = [
    { item_type: 7 },
    { item_type: 2 },
  ];
  assert.strictEqual(deriveCartModuleType(items), 2, 'Should pick first exclusive type');
}

function run () {
  testGetExclusiveTypes();
  testConflictDetection();
  testNoConflictSameType();
  testDeriveModuleType();
  console.log('✅ Cart exclusivity tests passed.');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error('❌ Cart exclusivity tests failed:', error);
  process.exit(1);
}

