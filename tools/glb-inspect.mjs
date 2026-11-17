// Разбор .glb без внешних библиотек: число треугольников, материалов, текстур, расширения.
// Нужен для проверки бюджетов (assets:report), когда в assets/ появятся реальные модели.
export function inspectGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('не GLB (нет сигнатуры glTF)');
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('первый чанк не JSON');
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  let tris = 0;
  for (const mesh of json.meshes ?? []) for (const p of mesh.primitives ?? []) {
    const mode = p.mode ?? 4;
    const count = p.indices != null ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
    tris += mode === 4 ? count / 3 : mode === 5 || mode === 6 ? Math.max(0, count - 2) : 0;
  }
  return {
    triangles: Math.round(tris),
    meshes: json.meshes?.length ?? 0,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    animations: json.animations?.length ?? 0,
    extensionsUsed: json.extensionsUsed ?? [],
    draco: (json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression'),
    meshopt: (json.extensionsUsed ?? []).includes('EXT_meshopt_compression'),
  };
}
