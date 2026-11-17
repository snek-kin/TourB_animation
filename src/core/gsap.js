// GSAP подключается классическим <script> (vendor/gsap/gsap.min.js) и живёт в globalThis.gsap.
// Этот модуль даёт единую точку импорта и понятную ошибку, если файл не загрузился.
export const gsap = globalThis.gsap;
if (!gsap) {
  throw new Error('GSAP не найден: проверьте, что vendor/gsap/gsap.min.js подключён в index.html перед main.js');
}
