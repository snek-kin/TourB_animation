/**
 * Прогрев сцены под «шторой»: компиляция шейдеров, загрузка текстур и геометрии в GPU и один пробный кадр ДО показа.
 * Без прогрева первый кадр с новым эффектом «подвисает» (в замерах Phase 1.5: стоп-кадры до сотен мс).
 * Невидимые объекты (маркеры и карточки до появления) на время прогрева делаются видимыми —
 * иначе renderer.compile их пропустит.
 */
export async function warmup(renderer, scene, camera) {
  const saved = [];
  scene.traverse((o) => { saved.push([o, o.visible]); o.visible = true; });
  try {
    scene.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) {
        for (const k in m) if (m[k]?.isTexture) renderer.initTexture(m[k]);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value?.isTexture) renderer.initTexture(u.value);
      }
    });
    // compileAsync опирается на KHR_parallel_shader_compile; без расширения (например, программный рендер)
    // three пишет предупреждение, поэтому тогда используем обычный синхронный compile — он под «шторой» безопасен.
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
    // Один настоящий кадр: драйвер (ANGLE/SwiftShader/Metal…) собирает конвейер рендера лениво, на первой отрисовке,
    // и compile() этого не делает. Замер Phase 1.5: без этого первый кадр на виду «стоял» ~1 с. Кадр рисуется под загрузчиком/«шторой».
    // Эффекты на нуле (uOpacity/uAppear = 0) ничего не растеризуют — фрагментный шейдер не исполнился бы и
    // «разогрелся» бы только на первом видимом кадре. Поэтому на время пробного кадра включаем их на полную.
    const uniformsToRestore = [];
    scene.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) {
        for (const k of ['uOpacity', 'uAppear']) {
          const u = m.uniforms?.[k];
          if (u) { uniformsToRestore.push([u, u.value]); u.value = 1; }
        }
      }
    });
    try { renderer.render(scene, camera); }
    finally { for (const [u, v] of uniformsToRestore) u.value = v; }
  } finally {
    for (const [o, v] of saved) o.visible = v;
  }
}
