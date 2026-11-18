// Bishkek Living Map — geographic data. Coordinates are curated approximations
// (verify against a live map before release); layout is stylized, not survey-grade.
// World axes: +x = east, +z = south. 1 world unit = 10 m. Origin = Ala-Too Square.
export const METERS_PER_UNIT = 10;
const LAT0 = 42.8756, LON0 = 74.6037;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
export function geo(lat, lon) {
  return [((lon - LON0) * M_PER_DEG_LON) / METERS_PER_UNIT, (-(lat - LAT0) * M_PER_DEG_LAT) / METERS_PER_UNIT];
}
export const CITY = { xMin: -380, xMax: 380, zMin: -280, zMax: 280 };
export const AVENUES_EW = [
  { name: 'Jibek Jolu', z: -46, w: 2.6 }, { name: 'Kievskaya', z: -16, w: 2.2 },
  { name: 'Chuy', z: 0, w: 3.4 }, { name: 'Toktogul', z: 18, w: 2.2 }, { name: 'Frunze', z: 34, w: 2.2 },
];
export const STREETS_NS = [
  { name: 'Shopokov', x: -52, w: 2.0 }, { name: 'Panfilov', x: -34, w: 2.4 },
  { name: 'Erkindik', x: -20, w: 4.2, boulevard: true }, { name: 'Manas', x: 0, w: 3.4 },
  { name: 'Tynystanov', x: 12, w: 1.8 }, { name: 'Isanov', x: 24, w: 2.2 },
  { name: 'Razzakov', x: 38, w: 1.8 }, { name: 'Ibraimov', x: 56, w: 2.4 },
];
export const RESERVES = [
  { id: 'alaToo', x: -8, z: 1, w: 16, d: 12, kind: 'plaza' },
  { id: 'museum', x: -9, z: -12, w: 18, d: 7, kind: 'landmark' },
  { id: 'whiteHouse', x: -11, z: 13, w: 22, d: 6, kind: 'landmark' },
  { id: 'philharmonic', x: 17, z: -14, w: 12, d: 8, kind: 'landmark' },
  { id: 'victory', x: 50, z: -5, w: 14, d: 12, kind: 'park' },
  { id: 'oakPark', x: -33, z: 2, w: 12, d: 14, kind: 'park' },
  { id: 'panfilovPark', x: -51, z: -15, w: 16, d: 13, kind: 'park' },
  { id: 'asanbay', x: 84, z: 52, w: 20, d: 16, kind: 'park' },
  { id: 'station', x: -26, z: 138, w: 12, d: 8, kind: 'landmark' },
  { id: 'oshBazaar', x: -196, z: 4, w: 26, d: 18, kind: 'market' },
];
export const CATEGORIES = {
  attractions: { label: 'Достопримечательности', color: 0xe4572e },
  food: { label: 'Рестораны', color: 0xffb03b },
  stay: { label: 'Жильё', color: 0x4fc3f7 },
  guides: { label: 'Гиды', color: 0x35e08a },
  events: { label: 'События', color: 0xd6408b },
};
// status: key from data/features.js STATUS — cards must carry the honest badge.
export const POIS = [
  { cat: 'attractions', title: 'Площадь Ала-Тоо', sub: 'Сердце Бишкека', lat: 42.8756, lon: 74.6037, status: 'mvp', hero: true },
  { cat: 'attractions', title: 'Исторический музей', sub: 'Площадь Ала-Тоо', lat: 42.8766, lon: 74.6037, status: 'mvp' },
  { cat: 'attractions', title: 'Площадь Победы', sub: 'Монумент-юрта', lat: 42.8758, lon: 74.6105, status: 'mvp' },
  { cat: 'attractions', title: 'Дубовый парк', sub: 'Скульптуры под дубами', lat: 42.8745, lon: 74.6005, status: 'mvp' },
  { cat: 'attractions', title: 'Филармония', sub: 'Имени Т. Сатылганова', lat: 42.8768, lon: 74.6062, status: 'mvp' },
  { cat: 'food', title: 'Navat', sub: 'Кыргызская кухня', lat: 42.8768, lon: 74.6050, status: 'mvp', hero: true },
  { cat: 'food', title: 'Faiza', sub: 'Домашняя кухня', lat: 42.8776, lon: 74.6002, status: 'mvp' },
  { cat: 'food', title: 'Supara', sub: 'Этно-комплекс', lat: 42.8716, lon: 74.6122, status: 'mvp' },
  { cat: 'stay', title: 'Hyatt Regency', sub: 'Отель · центр', lat: 42.8783, lon: 74.6052, status: 'links' },
  { cat: 'stay', title: 'Orion Hotel', sub: 'Отель · бизнес-класс', lat: 42.8752, lon: 74.6074, status: 'links' },
  { cat: 'stay', title: 'Иссык-Куль', sub: 'Гостиница', lat: 42.8778, lon: 74.6022, status: 'links' },
  { cat: 'guides', title: 'Айбек · горный гид', sub: 'Ала-Арча · ★4.9 (демо)', lat: 42.8750, lon: 74.6028, status: 'later' },
  { cat: 'guides', title: 'Нурай · гастро-гид', sub: 'Ошский рынок · ★4.8 (демо)', lat: 42.8742, lon: 74.5990, status: 'later' },
  { cat: 'events', title: 'Этно-джаз', sub: 'Филармония · пятница', lat: 42.8768, lon: 74.6066, status: 'later', hero: true },
  { cat: 'events', title: 'Кочевник Fest', sub: 'Асанбай · выходные', lat: 42.8708, lon: 74.6140, status: 'concept' },
];
export function resolvedPois() {
  return POIS.map((p) => { const [x, z] = geo(p.lat, p.lon); return { ...p, x, z }; });
}
