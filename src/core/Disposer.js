// Освобождение GPU-ресурсов. Ресурсы с userData.shared = true принадлежат AssetManager
// (кэш) и здесь НЕ освобождаются — иначе сломаются другие сцены, использующие тот же ассет.
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose(); // освобождает буферы instanceMatrix/instanceColor на GPU
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.userData?.shared) continue;
      for (const k in m) {
        const v = m[k];
        if (v && v.isTexture && !v.userData?.shared) v.dispose();
      }
      m.dispose();
    }
  });
}

export function markShared(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.userData.shared = true;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      m.userData.shared = true;
      for (const k in m) if (m[k]?.isTexture) m[k].userData.shared = true;
    }
  });
}
