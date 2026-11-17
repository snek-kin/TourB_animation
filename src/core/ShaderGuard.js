/**
 * Защита от сломанных шейдеров. three при ошибке компиляции только пишет в консоль, а затем КАЖДЫЙ кадр
 * спамит «useProgram: program not valid» (воспроизведено в Phase 1.5). Здесь мы после прогрева находим
 * материалы с неработающей программой и выключаем их объекты (через слой, чтобы код эффекта не включил их
 * обратно через .visible), а пользователю показываем понятное уведомление. Сцена продолжает работать без эффекта.
 */
export function findBrokenMaterials(renderer, scene) {
  const seen = new Set(), broken = [];
  scene.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) {
      if (seen.has(m)) continue; seen.add(m);
      const prog = renderer.properties.get(m)?.currentProgram;
      if (!prog) continue;
      // diagnostics заполняются лениво — при первом обращении к программе. Без расширения параллельной
      // компиляции (и с ним тоже) compile() сам их не заполняет, поэтому обращаемся явно: getUniforms()
      // вызывает проверку «первого использования» (она же пишет ошибку через renderer.debug.onShaderError).
      prog.getUniforms();
      const d = prog.diagnostics;
      if (d && d.runnable === false) broken.push({ object: o, material: m, diagnostics: d });
    }
  });
  return broken;
}

export function disableBroken(broken) {
  for (const { object } of broken) {
    object.layers.disableAll();          // камера (слой 0) такой объект больше не видит
    object.userData.shaderFailed = true;
  }
}

/** Проверка + отключение. Возвращает список отключённых (для тестов и HUD). */
export function guardScene(renderer, scene, onBroken) {
  const broken = findBrokenMaterials(renderer, scene);
  if (!broken.length) return broken;
  disableBroken(broken);
  for (const b of broken) {
    const log = [b.diagnostics.programLog, b.diagnostics.vertexShader?.log, b.diagnostics.fragmentShader?.log].filter(Boolean).join(' | ');
    console.error(`[ShaderGuard] эффект отключён: ${b.object.name || b.object.type} (${b.material.type}). ${log.slice(0, 300)}`);
    onBroken?.(b);
  }
  return broken;
}
