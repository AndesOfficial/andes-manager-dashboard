// Daily inventory log sections. Add an item by adding one line here.
// `lowAt`: remaining at or below this is flagged as low stock.

export const STOCK_SECTIONS = [
  {
    key: 'chemicals', label: 'Chemicals', items: [
      { key: 'detergent', label: 'Detergent', unit: 'kg', lowAt: 5 },
      { key: 'booster', label: 'Booster', unit: 'L', lowAt: 2 },
      { key: 'bleach', label: 'Bleach', unit: 'L', lowAt: 2 },
      { key: 'whitol', label: 'Whitol', unit: 'L', lowAt: 2 },
      { key: 'tenopole', label: 'Tenopole', unit: 'L', lowAt: 2 },
      { key: 'softner', label: 'Softner', unit: 'L', lowAt: 2 },
      { key: 'starch', label: 'Starch', unit: 'kg', lowAt: 1 },
      { key: 'dyeFixer', label: 'Dye fixer', unit: 'L', lowAt: 1 },
    ],
  },
  {
    key: 'stainRemovers', label: 'Stain removers', items: [
      { key: 'inkRem', label: 'Ink remover', unit: 'L', lowAt: 0.5 },
      { key: 'oilRem', label: 'Oil remover', unit: 'L', lowAt: 0.5 },
      { key: 'rustRem', label: 'Rust remover', unit: 'L', lowAt: 0.5 },
      { key: 'metacrystal', label: 'Metacrystal', unit: 'kg', lowAt: 0.5 },
    ],
  },
  {
    key: 'packaging', label: 'Packaging', items: [
      { key: 'whitePaper', label: 'White paper', unit: 'pcs', lowAt: 50 },
      { key: 'smallWhitePaper', label: 'Small white paper', unit: 'pcs', lowAt: 50 },
      { key: 'smallPolythene', label: 'Small polythene', unit: 'pcs', lowAt: 50 },
      { key: 'mediumPolythene', label: 'Medium polythene', unit: 'pcs', lowAt: 50 },
      { key: 'bigPolythene', label: 'Big polythene', unit: 'pcs', lowAt: 30 },
      { key: 'juteBags', label: 'Jute bags', unit: 'pcs', lowAt: 20 },
      { key: 'hangers', label: 'Hangers', unit: 'pcs', lowAt: 30 },
    ],
  },
  {
    key: 'other', label: 'Other things', items: [
      { key: 'tafetta', label: 'Tafetta', unit: 'rolls', lowAt: 1 },
      { key: 'stickerRoll', label: 'Sticker roll', unit: 'rolls', lowAt: 1 },
      { key: 'weighingMachine', label: 'Weighing machine', unit: 'pcs', lowAt: 0 },
      { key: 'ironingRope', label: 'Ironing rope', unit: 'pcs', lowAt: 0 },
      { key: 'floorCleaner', label: 'Floor cleaner', unit: 'L', lowAt: 1 },
      { key: 'bathroomCleaner', label: 'Bathroom cleaner', unit: 'L', lowAt: 1 },
      { key: 'handwash', label: 'Handwash', unit: 'L', lowAt: 0.5 },
    ],
  },
];

export const CLEANLINESS_AREAS = [
  { key: 'uniforms', label: 'Uniforms washed' },
  { key: 'mainArea', label: 'Main area' },
  { key: 'storageArea', label: 'Storage area' },
  { key: 'washroom', label: 'Washroom area' },
  { key: 'racks', label: 'Racks' },
  { key: 'outerArea', label: 'Outer area' },
  { key: 'garbage', label: 'Garbage management' },
];

export const VEHICLES = [
  { key: 'scooty1', label: 'Scooty 1' },
  { key: 'scooty2', label: 'Scooty 2' },
  { key: 'tempo', label: 'Tempo' },
];
