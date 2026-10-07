/**
 * Deterministic data generator for "Colmado Digital", a fictional Dominican
 * distributor. Pure: same seed, same data. No I/O here; `setup.ts` inserts.
 *
 * Amounts are integers in cents to avoid floating-point drift.
 */

export const DATA_START = '2025-10-01';
export const DATA_END = '2026-09-30';

export interface Category {
  id: number;
  name: string;
}
export interface Product {
  id: number;
  categoryId: number;
  name: string;
  brand: string;
  unitPriceCents: number;
  unit: string;
  active: boolean;
}
export interface SalesRep {
  id: number;
  name: string;
  region: string;
  hiredAt: string;
}
export interface Customer {
  id: number;
  name: string;
  customerType: string;
  province: string;
  city: string;
  salesRepId: number;
  since: string;
}
export type OrderStatus = 'paid' | 'pending' | 'cancelled';
export interface Order {
  id: number;
  customerId: number;
  salesRepId: number;
  orderDate: string;
  status: OrderStatus;
  totalCents: number;
}
export interface OrderItem {
  id: number;
  orderId: number;
  productId: number;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}
export interface SeedData {
  categories: Category[];
  products: Product[];
  salesReps: SalesRep[];
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
}

// ---------------------------------------------------------------------------
// PRNG (mulberry32): small, fast, deterministic.
// ---------------------------------------------------------------------------

export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) =>
      min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)]!,
    weighted: <T>(items: readonly T[], weights: readonly number[]): T => {
      const total = weights.reduce((s, w) => s + w, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i]!;
        if (r <= 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
  };
}

// ---------------------------------------------------------------------------
// Static catalogues
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'Bebidas',
  'Snacks',
  'Lácteos',
  'Granos y cereales',
  'Enlatados',
  'Limpieza',
  'Cuidado personal',
  'Panadería y galletas',
] as const;

type CategoryName = (typeof CATEGORIES)[number];

// [category, name, brand, price in RD$, unit]
const PRODUCTS: ReadonlyArray<
  readonly [CategoryName, string, string, number, string]
> = [
  ['Bebidas', 'Refresco Cola 2 L', 'Tropicola', 95, 'botella'],
  ['Bebidas', 'Refresco Naranja 2 L', 'Tropicola', 95, 'botella'],
  ['Bebidas', 'Agua Purificada 1 Gal', 'Cristalina', 55, 'galón'],
  ['Bebidas', 'Jugo de Chinola 1 L', 'Frutop', 110, 'caja'],
  ['Bebidas', 'Jugo de Naranja 1 L', 'Frutop', 110, 'caja'],
  ['Bebidas', 'Malta 355 ml', 'Malta Caribe', 45, 'botella'],
  ['Bebidas', 'Té Frío Limón 500 ml', 'Frutop', 60, 'botella'],
  ['Bebidas', 'Bebida Energética 250 ml', 'Volt', 85, 'lata'],
  ['Bebidas', 'Agua Mineral 500 ml', 'Cristalina', 25, 'botella'],
  ['Bebidas', 'Café Molido 1 lb', 'Café Cibao', 310, 'paquete'],
  ['Snacks', 'Platanitos 85 g', 'Crujiente', 50, 'funda'],
  ['Snacks', 'Papitas Sal 45 g', 'Crujiente', 35, 'funda'],
  ['Snacks', 'Papitas Queso 45 g', 'Crujiente', 35, 'funda'],
  ['Snacks', 'Maní Salado 100 g', 'Don Maní', 40, 'funda'],
  ['Snacks', 'Chicharrón de Harina 60 g', 'Crujiente', 30, 'funda'],
  ['Snacks', 'Palomitas Mantequilla 90 g', 'PopCaribe', 55, 'funda'],
  ['Snacks', 'Rosquitas de Maíz 50 g', 'Crujiente', 30, 'funda'],
  ['Snacks', 'Chocolate con Leche 40 g', 'Cacao Dorado', 65, 'barra'],
  ['Snacks', 'Caramelos Surtidos 100 u', 'Dulcería Mía', 120, 'bolsa'],
  ['Snacks', 'Chicle Menta 10 u', 'Dulcería Mía', 25, 'paquete'],
  ['Lácteos', 'Leche Entera 1 L', 'Vaquita', 85, 'caja'],
  ['Lácteos', 'Leche Evaporada 410 g', 'Vaquita', 75, 'lata'],
  ['Lácteos', 'Leche Condensada 395 g', 'Vaquita', 95, 'lata'],
  ['Lácteos', 'Queso de Freír 1 lb', 'Quesos del Valle', 265, 'libra'],
  ['Lácteos', 'Queso Amarillo 500 g', 'Quesos del Valle', 320, 'paquete'],
  ['Lácteos', 'Yogur Fresa 150 g', 'Vaquita', 45, 'vaso'],
  ['Lácteos', 'Mantequilla 227 g', 'Vaquita', 160, 'barra'],
  ['Lácteos', 'Crema de Leche 200 ml', 'Vaquita', 90, 'caja'],
  ['Lácteos', 'Leche en Polvo 400 g', 'Vaquita', 285, 'funda'],
  ['Lácteos', 'Huevos 30 u', 'Granja San José', 240, 'cartón'],
  ['Granos y cereales', 'Arroz Selecto 5 lb', 'La Cosecha', 275, 'funda'],
  ['Granos y cereales', 'Arroz Selecto 10 lb', 'La Cosecha', 540, 'funda'],
  ['Granos y cereales', 'Habichuelas Rojas 1 lb', 'La Cosecha', 95, 'funda'],
  ['Granos y cereales', 'Habichuelas Negras 1 lb', 'La Cosecha', 90, 'funda'],
  ['Granos y cereales', 'Guandules Verdes 1 lb', 'La Cosecha', 110, 'funda'],
  ['Granos y cereales', 'Avena en Hojuelas 400 g', 'Amanecer', 120, 'caja'],
  ['Granos y cereales', 'Harina de Maíz 1 lb', 'La Cosecha', 55, 'funda'],
  ['Granos y cereales', 'Harina de Trigo 2 lb', 'La Cosecha', 95, 'funda'],
  ['Granos y cereales', 'Cereal de Maíz 300 g', 'Amanecer', 180, 'caja'],
  ['Granos y cereales', 'Azúcar Crema 5 lb', 'Ingenio Sur', 210, 'funda'],
  ['Enlatados', 'Sardinas en Tomate 425 g', 'Mar Azul', 120, 'lata'],
  ['Enlatados', 'Atún en Aceite 170 g', 'Mar Azul', 95, 'lata'],
  ['Enlatados', 'Salchichas 8 u', 'Don Embutido', 70, 'lata'],
  ['Enlatados', 'Maíz Dulce 425 g', 'Huerta Fresca', 85, 'lata'],
  ['Enlatados', 'Habichuelas Guisadas 425 g', 'Huerta Fresca', 90, 'lata'],
  ['Enlatados', 'Salsa de Tomate 227 g', 'Huerta Fresca', 40, 'lata'],
  ['Enlatados', 'Pasta de Tomate 170 g', 'Huerta Fresca', 55, 'lata'],
  ['Enlatados', 'Spaghetti 400 g', 'Pasta Nostra', 60, 'paquete'],
  ['Enlatados', 'Aceite Vegetal 1 L', 'Girasol', 190, 'botella'],
  ['Enlatados', 'Sopa Instantánea 65 g', 'Sopita', 30, 'vaso'],
  ['Limpieza', 'Detergente en Polvo 1 kg', 'Blancura', 165, 'funda'],
  ['Limpieza', 'Cloro 1 Gal', 'Blancura', 120, 'galón'],
  ['Limpieza', 'Jabón de Cuaba 3 u', 'Blancura', 75, 'paquete'],
  ['Limpieza', 'Lavaplatos Líquido 500 ml', 'Brillo', 95, 'botella'],
  ['Limpieza', 'Desinfectante Pino 1 L', 'Brillo', 110, 'botella'],
  ['Limpieza', 'Suavizante 1 L', 'Blancura', 140, 'botella'],
  ['Limpieza', 'Esponja Multiuso 3 u', 'Brillo', 60, 'paquete'],
  ['Limpieza', 'Papel Toalla 2 rollos', 'Suavecito', 130, 'paquete'],
  ['Limpieza', 'Fundas de Basura 10 u', 'Brillo', 85, 'rollo'],
  ['Limpieza', 'Insecticida Aerosol 400 ml', 'Brillo', 210, 'lata'],
  ['Cuidado personal', 'Papel Higiénico 4 rollos', 'Suavecito', 150, 'paquete'],
  ['Cuidado personal', 'Jabón de Baño 125 g', 'Aroma', 55, 'barra'],
  ['Cuidado personal', 'Shampoo 400 ml', 'Aroma', 195, 'botella'],
  ['Cuidado personal', 'Pasta Dental 100 ml', 'Sonrisa', 95, 'tubo'],
  ['Cuidado personal', 'Cepillo Dental', 'Sonrisa', 65, 'unidad'],
  ['Cuidado personal', 'Desodorante Roll-on 50 ml', 'Aroma', 120, 'unidad'],
  ['Cuidado personal', 'Toallas Sanitarias 10 u', 'Suavecito', 85, 'paquete'],
  ['Cuidado personal', 'Pañales Talla M 20 u', 'Bebé Feliz', 390, 'paquete'],
  ['Cuidado personal', 'Afeitadora Desechable 3 u', 'Aroma', 90, 'paquete'],
  ['Cuidado personal', 'Crema Corporal 200 ml', 'Aroma', 160, 'frasco'],
  ['Panadería y galletas', 'Pan de Agua 6 u', 'Horno Criollo', 60, 'funda'],
  ['Panadería y galletas', 'Pan Sobao 6 u', 'Horno Criollo', 70, 'funda'],
  ['Panadería y galletas', 'Pan de Molde 500 g', 'Horno Criollo', 110, 'funda'],
  [
    'Panadería y galletas',
    'Galletas de Soda 8 u',
    'Galletera RD',
    55,
    'paquete',
  ],
  [
    'Panadería y galletas',
    'Galletas Dulces 200 g',
    'Galletera RD',
    65,
    'paquete',
  ],
  [
    'Panadería y galletas',
    'Galletas Chocolate 150 g',
    'Galletera RD',
    80,
    'paquete',
  ],
  [
    'Panadería y galletas',
    'Bizcocho Vainilla 400 g',
    'Horno Criollo',
    220,
    'unidad',
  ],
  ['Panadería y galletas', 'Tostadas 200 g', 'Galletera RD', 70, 'paquete'],
  ['Panadería y galletas', 'Wafers Fresa 140 g', 'Galletera RD', 60, 'paquete'],
  ['Panadería y galletas', 'Pan Integral 500 g', 'Horno Criollo', 125, 'funda'],
];

// Province, main cities, region, population weight (rough, for sampling).
const PROVINCES: ReadonlyArray<
  readonly [string, readonly string[], string, number]
> = [
  ['Distrito Nacional', ['Santo Domingo'], 'Gran Santo Domingo', 20],
  [
    'Santo Domingo',
    ['Santo Domingo Este', 'Santo Domingo Norte', 'Los Alcarrizos'],
    'Gran Santo Domingo',
    28,
  ],
  ['Santiago', ['Santiago de los Caballeros', 'Tamboril'], 'Cibao Norte', 16],
  ['La Vega', ['La Vega', 'Jarabacoa', 'Constanza'], 'Cibao Sur', 6],
  ['Puerto Plata', ['Puerto Plata', 'Sosúa'], 'Cibao Norte', 5],
  ['Duarte', ['San Francisco de Macorís'], 'Cibao Nordeste', 5],
  ['San Cristóbal', ['San Cristóbal', 'Haina'], 'Sur', 7],
  ['San Pedro de Macorís', ['San Pedro de Macorís'], 'Este', 5],
  ['La Romana', ['La Romana'], 'Este', 4],
  ['La Altagracia', ['Higüey', 'Punta Cana'], 'Este', 5],
  ['Espaillat', ['Moca'], 'Cibao Norte', 3],
  ['Peravia', ['Baní'], 'Sur', 3],
  ['Azua', ['Azua'], 'Sur', 3],
  ['Barahona', ['Barahona'], 'Sur', 2],
  ['Monseñor Nouel', ['Bonao'], 'Cibao Sur', 3],
  ['Valverde', ['Mao'], 'Cibao Noroeste', 2],
  ['Sánchez Ramírez', ['Cotuí'], 'Cibao Sur', 2],
  ['María Trinidad Sánchez', ['Nagua'], 'Cibao Nordeste', 2],
  ['Hato Mayor', ['Hato Mayor del Rey'], 'Este', 1],
  ['Monte Plata', ['Monte Plata'], 'Gran Santo Domingo', 2],
];

const SALES_REPS: ReadonlyArray<readonly [string, string, string]> = [
  ['Yomaira Peña', 'Gran Santo Domingo', '2021-03-15'],
  ['Luis Almonte', 'Gran Santo Domingo', '2022-08-01'],
  ['Carolina Hernández', 'Cibao Norte', '2020-11-02'],
  ['Rafael Taveras', 'Cibao Sur', '2023-01-16'],
  ['Marisol Guzmán', 'Cibao Nordeste', '2022-05-09'],
  ['Juan Carlos Féliz', 'Sur', '2019-09-23'],
  ['Altagracia Mejía', 'Este', '2021-06-07'],
  ['Pedro Luna', 'Cibao Noroeste', '2023-04-03'],
];

const CUSTOMER_TYPES = [
  'Colmado',
  'Supermercado',
  'Minimarket',
  'Cafetería',
  'Almacén',
] as const;
const CUSTOMER_TYPE_WEIGHTS = [60, 8, 15, 10, 7];

const FEMALE_NAMES = [
  'Rosa',
  'Juana',
  'Altagracia',
  'Mercedes',
  'Ana',
  'Carmen',
  'Yolanda',
  'Josefina',
  'Luz',
  'Milagros',
];
const MALE_NAMES = [
  'Miguel',
  'Ramón',
  'Felipe',
  'José',
  'Tomás',
  'Pedro',
  'Manuel',
  'Francisco',
  'Rafael',
  'Antonio',
];
const SURNAMES = [
  'Pérez',
  'Rodríguez',
  'Martínez',
  'García',
  'Reyes',
  'Sánchez',
  'Díaz',
  'Jiménez',
  'Castillo',
  'Núñez',
  'Vargas',
  'Mota',
  'Peralta',
  'Báez',
  'Ureña',
  'Cabrera',
];
const PLACE_NAMES = [
  'El Progreso',
  'La Esperanza',
  'Los Hermanos',
  'La Fe',
  'El Buen Precio',
  'La Economía',
  'Mi Barrio',
  'La Bendición',
  'El Ahorro',
  'San Miguel',
  'Los Tres Reyes',
  'La Unión',
  'El Sol',
  'La Fortuna',
  'El Encanto',
  'Brisas del Mar',
];

// Seasonality: December peak, slow start of year.
const MONTH_WEIGHTS: Record<string, number> = {
  '2025-10': 0.95,
  '2025-11': 1.0,
  '2025-12': 1.45,
  '2026-01': 0.8,
  '2026-02': 0.85,
  '2026-03': 0.95,
  '2026-04': 1.0,
  '2026-05': 1.05,
  '2026-06': 1.0,
  '2026-07': 1.05,
  '2026-08': 1.05,
  '2026-09': 0.95,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfWeek(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export interface SeedOptions {
  seed?: number;
  customerCount?: number;
  orderCount?: number;
}

export function generateSeed(options: SeedOptions = {}): SeedData {
  const { seed = 20251001, customerCount = 300, orderCount = 4000 } = options;
  const rng = createRng(seed);

  const categories: Category[] = CATEGORIES.map((name, i) => ({
    id: i + 1,
    name,
  }));
  const categoryId = new Map(categories.map((c) => [c.name, c.id]));

  const products: Product[] = PRODUCTS.map(
    ([category, name, brand, price, unit], i) => ({
      id: i + 1,
      categoryId: categoryId.get(category)!,
      name,
      brand,
      unitPriceCents: Math.round(price * 100),
      unit,
      // A few discontinued products so "active" means something.
      active: i % 23 !== 7,
    }),
  );

  const salesReps: SalesRep[] = SALES_REPS.map(
    ([name, region, hiredAt], i) => ({ id: i + 1, name, region, hiredAt }),
  );
  const repsByRegion = new Map<string, SalesRep[]>();
  for (const rep of salesReps) {
    repsByRegion.set(rep.region, [
      ...(repsByRegion.get(rep.region) ?? []),
      rep,
    ]);
  }

  const provinceWeights = PROVINCES.map((p) => p[3]);
  const usedNames = new Set<string>();
  const customers: Customer[] = [];
  for (let i = 0; i < customerCount; i++) {
    const [province, cities, region] = rng.weighted(PROVINCES, provinceWeights);
    const type = rng.weighted(CUSTOMER_TYPES, CUSTOMER_TYPE_WEIGHTS);
    const city = rng.pick(cities);
    const style = rng.next();
    let name: string;
    if (style < 0.45) {
      name =
        rng.next() < 0.5
          ? `${type} Doña ${rng.pick(FEMALE_NAMES)}`
          : `${type} Don ${rng.pick(MALE_NAMES)}`;
    } else if (style < 0.8) {
      name = `${type} ${rng.pick(PLACE_NAMES)}`;
    } else {
      const suffix = rng.pick(['& Hijos', 'Hermanos', '']);
      name = `${type} ${rng.pick(SURNAMES)} ${suffix}`.trim();
    }
    // The name space is small, so disambiguate like real businesses do:
    // first by city, then by a number.
    if (usedNames.has(name)) name = `${name} ${city}`;
    const base = name;
    for (let n = 2; usedNames.has(name); n++) name = `${base} ${n}`;
    usedNames.add(name);
    const reps = repsByRegion.get(region)!;
    customers.push({
      id: i + 1,
      name,
      customerType: type,
      province,
      city,
      salesRepId: rng.pick(reps).id,
      since: isoDate(rng.int(2019, 2025), rng.int(1, 12), rng.int(1, 28)),
    });
  }

  // Customer activity: supermarkets order more; a long tail of small ones.
  const customerWeights = customers.map((c) => {
    const base =
      c.customerType === 'Supermercado'
        ? 4
        : c.customerType === 'Almacén'
          ? 2.5
          : 1;
    return base * (0.4 + rng.next() * 1.2);
  });

  const months = Object.keys(MONTH_WEIGHTS);
  const monthWeights = months.map((m) => MONTH_WEIGHTS[m]!);
  const activeProducts = products.filter((p) => p.active);
  const productWeights = activeProducts.map((p) => {
    // Cheaper everyday items move more units.
    const base =
      p.unitPriceCents < 10000 ? 3 : p.unitPriceCents < 20000 ? 2 : 1;
    return base * (0.5 + rng.next());
  });

  // Draw order dates first, then sort so ids follow chronology.
  const drafts: Array<{ date: string; customer: Customer }> = [];
  for (let i = 0; i < orderCount; i++) {
    const month = rng.weighted(months, monthWeights);
    const [y, m] = month.split('-').map(Number) as [number, number];
    let day = rng.int(1, daysInMonth(y, m));
    // Sundays are mostly closed: shift to Saturday.
    if (dayOfWeek(y, m, day) === 0 && rng.next() < 0.85) {
      day = Math.max(1, day - 1);
    }
    drafts.push({
      date: isoDate(y, m, day),
      customer: rng.weighted(customers, customerWeights),
    });
  }
  drafts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  let itemId = 1;
  drafts.forEach((draft, i) => {
    const orderId = i + 1;
    const lineCount = rng.int(1, 8);
    const chosen = new Set<number>();
    let totalCents = 0;
    for (let l = 0; l < lineCount; l++) {
      const product = rng.weighted(activeProducts, productWeights);
      if (chosen.has(product.id)) continue;
      chosen.add(product.id);
      const quantity = rng.weighted(
        [1, 2, 3, 4, 6, 12, 24],
        [10, 20, 15, 15, 12, 10, 4],
      );
      const lineTotalCents = quantity * product.unitPriceCents;
      totalCents += lineTotalCents;
      orderItems.push({
        id: itemId++,
        orderId,
        productId: product.id,
        quantity,
        unitPriceCents: product.unitPriceCents,
        lineTotalCents,
      });
    }
    // Recent orders are more likely to still be pending.
    const isRecent = draft.date >= '2026-09-01';
    const status = rng.weighted<OrderStatus>(
      ['paid', 'pending', 'cancelled'],
      isRecent ? [60, 35, 5] : [88, 6, 6],
    );
    // Occasionally the customer's usual rep is covered by a colleague.
    const salesRepId =
      rng.next() < 0.92 ? draft.customer.salesRepId : rng.pick(salesReps).id;
    orders.push({
      id: orderId,
      customerId: draft.customer.id,
      salesRepId,
      orderDate: draft.date,
      status,
      totalCents,
    });
  });

  return { categories, products, salesReps, customers, orders, orderItems };
}
