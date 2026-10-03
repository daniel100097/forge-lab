import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Feedback } from "./UI";
/** Loads repository objects with native authenticated file URLs; no remote model assets. */
export default function ModelPreview({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const { t } = useTranslation("repository");
  const host = useRef<HTMLDivElement>(null),
    reset = useRef<() => void>(() => {});
  const [error, setError] = useState<Error | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let dispose = () => {};
    setError(null);
    setLoading(true);
    void (async () => {
      const THREE = await import("three");
      const { OrbitControls } =
        await import("three/addons/controls/OrbitControls.js");
      const response = await fetch(url, {
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(t("model.loadFailed"));
      const stream = response.body?.getReader();
      if (!stream) throw new Error(t("model.empty"));
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const item = await stream.read();
          if (item.done) break;
          length += item.value.length;
          if (length > 32 * 1024 * 1024) {
            await stream.cancel();
            throw new Error(t("model.tooLarge"));
          }
          chunks.push(item.value);
        }
      } finally {
        stream.releaseLock();
      }
      const buffer = await new Blob(chunks as BlobPart[]).arrayBuffer();
      if (controller.signal.aborted || !host.current) return;
      const manager = new THREE.LoadingManager();
      const root = new URL(
        ".",
        url.startsWith("http") ? url : new URL(url, location.href).href,
      );
      manager.setURLModifier((resource) => {
        if (/^(data|blob):/.test(resource)) return resource;
        const destination = new URL(resource, root);
        if (
          destination.origin !== location.origin ||
          !destination.pathname.startsWith(root.pathname)
        )
          throw new Error(t("model.external"));
        return destination.href;
      });
      let model: import("three").Object3D;
      if (/\.stl$/i.test(filename)) {
        const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
        const geometry = new STLLoader(manager).parse(buffer);
        model = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: 0x9c91d4,
            metalness: 0.1,
            roughness: 0.55,
          }),
        );
      } else if (/\.obj$/i.test(filename)) {
        const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
        model = new OBJLoader(manager).parse(new TextDecoder().decode(buffer));
      } else if (/\.3mf$/i.test(filename)) {
        const { ThreeMFLoader } =
          await import("three/addons/loaders/3MFLoader.js");
        model = new ThreeMFLoader(manager).parse(buffer);
      } else {
        const { GLTFLoader } =
          await import("three/addons/loaders/GLTFLoader.js");
        model = await new Promise<import("three").Object3D>((resolve, reject) =>
          new GLTFLoader(manager).parse(
            buffer,
            root.href,
            (result) => resolve(result.scene),
            reject,
          ),
        );
      }
      if (controller.signal.aborted || !host.current) return;
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      const bounds = new THREE.Box3().setFromObject(model),
        center = bounds.getCenter(new THREE.Vector3()),
        size = bounds.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z) || 1;
      model.position.sub(center);
      const group = new THREE.Group();
      group.add(model);
      group.scale.setScalar(2 / extent);
      scene.add(group);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x454050, 2));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(3, 5, 4);
      scene.add(light);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute(
        "aria-label",
        t("model.label", { name: filename }),
      );
      renderer.domElement.setAttribute("role", "img");
      host.current.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.listenToKeyEvents(renderer.domElement);
      reset.current = () => {
        camera.position.set(3, 2, 4);
        controls.target.set(0, 0, 0);
        controls.update();
      };
      reset.current();
      const observer = new ResizeObserver(() => {
        if (!host.current) return;
        const width = host.current.clientWidth,
          height = host.current.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      });
      observer.observe(host.current);
      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });
      dispose = () => {
        observer.disconnect();
        controls.dispose();
        renderer.setAnimationLoop(null);
        renderer.dispose();
        renderer.domElement.remove();
        scene.traverse((object) => {
          const mesh = object as import("three").Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            const materials = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            materials.forEach((material) => material.dispose());
          }
        });
      };
      setLoading(false);
    })().catch((reason) => {
      if (!controller.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason
            : new Error(t("model.previewFailed")),
        );
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
      dispose();
    };
  }, [url, filename]);
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 text-xs text-muted">
        <span>{t("model.controls")}</span>
        <button
          className="button"
          onClick={() => reset.current()}
          disabled={loading || !!error}
        >
          <RotateCcw size={14} />
          {t("model.reset")}
        </button>
      </div>
      <Feedback error={error} />
      {loading && (
        <p role="status" className="p-4 text-sm text-muted">
          {t("model.loading")}
        </p>
      )}
      <div
        ref={host}
        className="h-[480px] max-h-[65vh] w-full [&_canvas]:block [&_canvas]:w-full [&_canvas:focus-visible]:outline-2 [&_canvas:focus-visible]:outline-primary"
        hidden={!!error}
      />
    </section>
  );
}
