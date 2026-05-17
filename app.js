import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const MAX_POINTS = 4;

const inputX = document.getElementById("inputX");
const inputY = document.getElementById("inputY");
const inputZ = document.getElementById("inputZ");
const addButton = document.getElementById("addPoint");
const removeButton = document.getElementById("removeLast");
const clearButton = document.getElementById("clearAll");
const sampleButton = document.getElementById("loadSample");
const randomButton = document.getElementById("randomPoints");
const resetViewButton = document.getElementById("resetView");
const copyStandardButton = document.getElementById("copyStandard");
const copyGeneralButton = document.getElementById("copyGeneral");
const pointList = document.getElementById("pointList");
const statusText = document.getElementById("statusText");
const equationStandard = document.getElementById("equationStandard");
const equationGeneral = document.getElementById("equationGeneral");

let points = [];

const scene = new THREE.Scene();
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setClearColor(0x000000, 0);

const viewer = document.querySelector(".viewer");
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
labelRenderer.domElement.className = "label-layer";
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.left = "0";
labelRenderer.domElement.style.pointerEvents = "none";
viewer.appendChild(labelRenderer.domElement);

const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 2000);
const defaultCameraPosition = new THREE.Vector3(6, 6, 8);
const defaultTarget = new THREE.Vector3(0, 0, 0);
const defaultViewDirection = defaultCameraPosition.clone().sub(defaultTarget).normalize();
camera.position.copy(defaultCameraPosition);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
const directional = new THREE.DirectionalLight(0xffffff, 0.8);
directional.position.set(8, 10, 6);
scene.add(ambient, directional);

const grid = new THREE.GridHelper(20, 20, 0x9bb3b6, 0xd3e4e4);
grid.material.opacity = 0.35;
grid.material.transparent = true;
scene.add(grid);

const axes = new THREE.AxesHelper(3);
axes.material.opacity = 0.7;
axes.material.transparent = true;
scene.add(axes);

let sceneObjects = [];

const COLORS = {
  point: 0xe45a4f,
  line: 0x36b5ad,
  circle: 0xf2a541,
  sphere: 0x6d7bd9,
  center: 0x1e6c78
};

function setStatus(message) {
  statusText.textContent = message;
}

function copyText(value, message) {
  if (!value) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value)
      .then(() => setStatus(message))
      .catch(() => fallbackCopy(value, message));
    return;
  }

  fallbackCopy(value, message);
}

function fallbackCopy(value, message) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    setStatus(message);
  } catch (error) {
    setStatus("Kopieren fehlgeschlagen. Gleichung markieren und manuell kopieren.");
  } finally {
    document.body.removeChild(textarea);
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "NaN";
  }
  let output = value.toFixed(4);
  output = output.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  if (output === "-0") {
    return "0";
  }
  return output;
}

function formatShift(variable, value) {
  const absValue = Math.abs(value);
  if (absValue < 1e-12) {
    return variable;
  }
  if (value >= 0) {
    return `${variable} - ${formatNumber(absValue)}`;
  }
  return `${variable} + ${formatNumber(absValue)}`;
}

function formatSignedTerm(coefficient, variable) {
  if (Math.abs(coefficient) < 1e-10) {
    return "";
  }
  const sign = coefficient >= 0 ? "+" : "-";
  return ` ${sign} ${formatNumber(Math.abs(coefficient))}${variable}`;
}

function updateEquationDisplay(sphere) {
  const axis1 = "x<sub>1</sub>";
  const axis2 = "x<sub>2</sub>";
  const axis3 = "x<sub>3</sub>";

  if (!sphere) {
    equationStandard.innerHTML = "<span class=\"eq\">(x<sub>1</sub> - a)<sup>2</sup> + (x<sub>2</sub> - b)<sup>2</sup> + (x<sub>3</sub> - c)<sup>2</sup> = r<sup>2</sup></span>";
    equationGeneral.innerHTML = "<span class=\"eq\">x<sub>1</sub><sup>2</sup> + x<sub>2</sub><sup>2</sup> + x<sub>3</sub><sup>2</sup> + ax<sub>1</sub> + bx<sub>2</sub> + cx<sub>3</sub> + d = 0</span>";
    return;
  }

  const { center, radius } = sphere;
  const a = center.x;
  const b = center.y;
  const c = center.z;

  equationStandard.innerHTML = `<span class=\"eq\">(${formatShift(axis1, a)})<sup>2</sup> + (${formatShift(axis2, b)})<sup>2</sup> + (${formatShift(axis3, c)})<sup>2</sup> = ${formatNumber(radius * radius)}</span>`;

  const D = -2 * a;
  const E = -2 * b;
  const F = -2 * c;
  const G = a * a + b * b + c * c - radius * radius;

  let expanded = `${axis1}<sup>2</sup> + ${axis2}<sup>2</sup> + ${axis3}<sup>2</sup>`;
  expanded += formatSignedTerm(D, axis1);
  expanded += formatSignedTerm(E, axis2);
  expanded += formatSignedTerm(F, axis3);
  if (Math.abs(G) >= 1e-10) {
    const sign = G >= 0 ? "+" : "-";
    expanded += ` ${sign} ${formatNumber(Math.abs(G))}`;
  }
  expanded += " = 0";
  equationGeneral.innerHTML = `<span class=\"eq\">${expanded}</span>`;
}

function fitCameraToPoints(vectors) {
  if (vectors.length === 0) {
    return;
  }

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }

  const box = new THREE.Box3().setFromPoints(vectors);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);

  const radius = Math.max(sphere.radius, 0.75);
  const center = sphere.center;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2)) * 1.2;

  camera.position.copy(center).add(defaultViewDirection.clone().multiplyScalar(distance));
  camera.near = Math.max(distance / 100, 0.1);
  camera.far = Math.max(distance * 100, 2000);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function clearSceneObjects() {
  sceneObjects.forEach((object) => {
    scene.remove(object);
    disposeObject(object);
  });
  sceneObjects = [];
}

function disposeObject(object) {
  if (object.geometry) {
    object.geometry.dispose();
  }
  if (object.material) {
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material.dispose();
    }
  }
  if (object.element && object.element.parentNode) {
    object.element.parentNode.removeChild(object.element);
  }
  if (object.children && object.children.length > 0) {
    object.children.forEach((child) => disposeObject(child));
  }
}

function createLabel(text, className) {
  const element = document.createElement("div");
  element.className = `label ${className}`.trim();
  element.textContent = text;
  return new CSS2DObject(element);
}

function estimateScale(vectors) {
  if (vectors.length < 2) {
    return 1;
  }
  const box = new THREE.Box3().setFromPoints(vectors);
  const size = new THREE.Vector3();
  box.getSize(size);
  return size.length() || 1;
}

function addPoints(vectors) {
  const scale = estimateScale(vectors);
  const radius = Math.min(Math.max(scale * 0.02, 0.05), 0.25);
  vectors.forEach((point) => {
    const geometry = new THREE.SphereGeometry(radius, 24, 18);
    const material = new THREE.MeshStandardMaterial({ color: COLORS.point });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(point);
    scene.add(mesh);
    sceneObjects.push(mesh);
  });
}

function addLine(p1, p2) {
  const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  const material = new THREE.LineBasicMaterial({ color: COLORS.line });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  sceneObjects.push(line);
}

function computeCircle(points3D) {
  const [p1, p2, p3] = points3D;
  const v1 = new THREE.Vector3().subVectors(p2, p1);
  const v2 = new THREE.Vector3().subVectors(p3, p1);
  const normal = new THREE.Vector3().crossVectors(v1, v2);
  const normalLength = normal.length();
  if (normalLength < 1e-9) {
    return { error: "Punkte sind kollinear; kein eindeutiger Kreis." };
  }

  normal.normalize();
  const xAxis = v1.clone();
  const d = xAxis.length();
  if (d < 1e-9) {
    return { error: "Die ersten beiden Punkte sind identisch; kein eindeutiger Kreis." };
  }
  xAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  const x1 = 0;
  const y1 = 0;
  const x2 = d;
  const y2 = 0;
  const rel3 = new THREE.Vector3().subVectors(p3, p1);
  const x3 = rel3.dot(xAxis);
  const y3 = rel3.dot(yAxis);

  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  const scale = Math.max(d, Math.abs(x3), Math.abs(y3), 1);
  if (Math.abs(D) < 1e-8 * scale * scale) {
    return { error: "Punkte sind fast kollinear; Kreis ist numerisch instabil." };
  }

  const x1Sq = x1 * x1 + y1 * y1;
  const x2Sq = x2 * x2 + y2 * y2;
  const x3Sq = x3 * x3 + y3 * y3;

  const ux = (x1Sq * (y2 - y3) + x2Sq * (y3 - y1) + x3Sq * (y1 - y2)) / D;
  const uy = (x1Sq * (x3 - x2) + x2Sq * (x1 - x3) + x3Sq * (x2 - x1)) / D;

  const center = new THREE.Vector3()
    .copy(p1)
    .add(xAxis.clone().multiplyScalar(ux))
    .add(yAxis.clone().multiplyScalar(uy));

  const radius = center.distanceTo(p1);

  return {
    center,
    radius,
    normal,
    xAxis,
    yAxis
  };
}

function addCircle(circle) {
  const segments = 160;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const position = new THREE.Vector3()
      .copy(circle.center)
      .add(circle.xAxis.clone().multiplyScalar(Math.cos(angle) * circle.radius))
      .add(circle.yAxis.clone().multiplyScalar(Math.sin(angle) * circle.radius));
    points.push(position);
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: COLORS.circle });
  const lineLoop = new THREE.Line(geometry, material);
  scene.add(lineLoop);
  sceneObjects.push(lineLoop);
}

function det3(a, b, c) {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0])
  );
}

function solve3x3(A, b) {
  const detA = det3(A[0], A[1], A[2]);
  const rowNorm = (row) => Math.sqrt(row[0] * row[0] + row[1] * row[1] + row[2] * row[2]);
  const scale = Math.max(rowNorm(A[0]) * rowNorm(A[1]) * rowNorm(A[2]), 1);
  if (Math.abs(detA) < 1e-8 * scale) {
    return { error: "System ist singulär oder nahezu koplanar." };
  }

  const detX = det3([b[0], A[0][1], A[0][2]], [b[1], A[1][1], A[1][2]], [b[2], A[2][1], A[2][2]]);
  const detY = det3([A[0][0], b[0], A[0][2]], [A[1][0], b[1], A[1][2]], [A[2][0], b[2], A[2][2]]);
  const detZ = det3([A[0][0], A[0][1], b[0]], [A[1][0], A[1][1], b[1]], [A[2][0], A[2][1], b[2]]);

  return {
    solution: new THREE.Vector3(detX / detA, detY / detA, detZ / detA)
  };
}

function computeSphere(points3D) {
  const [p1, p2, p3, p4] = points3D;
  const r1 = new THREE.Vector3().subVectors(p2, p1).multiplyScalar(2);
  const r2 = new THREE.Vector3().subVectors(p3, p1).multiplyScalar(2);
  const r3 = new THREE.Vector3().subVectors(p4, p1).multiplyScalar(2);

  const A = [
    [r1.x, r1.y, r1.z],
    [r2.x, r2.y, r2.z],
    [r3.x, r3.y, r3.z]
  ];

  const b = [
    p2.lengthSq() - p1.lengthSq(),
    p3.lengthSq() - p1.lengthSq(),
    p4.lengthSq() - p1.lengthSq()
  ];

  const solved = solve3x3(A, b);
  if (solved.error) {
    return { error: "Punkte sind koplanar oder nahezu koplanar; keine stabile Kugel." };
  }

  const center = solved.solution;
  const radius = center.distanceTo(p1);

  if (!Number.isFinite(radius) || radius < 1e-9) {
    return { error: "Kugelradius ist numerisch instabil." };
  }

  return { center, radius };
}

function addSphere(sphere) {
  const geometry = new THREE.SphereGeometry(sphere.radius, 48, 36);
  const material = new THREE.MeshStandardMaterial({
    color: COLORS.sphere,
    transparent: true,
    opacity: 0.22,
    roughness: 0.25,
    metalness: 0.05
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(sphere.center);

  const wireGeometry = new THREE.WireframeGeometry(geometry);
  const wireMaterial = new THREE.LineBasicMaterial({ color: COLORS.sphere, opacity: 0.5, transparent: true });
  const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);
  mesh.add(wireframe);

  scene.add(mesh);
  sceneObjects.push(mesh);
}

function addSphereAnnotations(sphere) {
  const markerSize = Math.min(Math.max(sphere.radius * 0.05, 0.06), 0.25);
  const centerGeometry = new THREE.SphereGeometry(markerSize, 20, 14);
  const centerMaterial = new THREE.MeshStandardMaterial({ color: COLORS.center });
  const centerMesh = new THREE.Mesh(centerGeometry, centerMaterial);
  centerMesh.position.copy(sphere.center);
  scene.add(centerMesh);
  sceneObjects.push(centerMesh);

  const centerLabel = createLabel(
    `Mittelpunkt (${formatNumber(sphere.center.x)}, ${formatNumber(sphere.center.y)}, ${formatNumber(sphere.center.z)})`,
    "label-center"
  );
  centerLabel.position.copy(sphere.center).add(new THREE.Vector3(0, markerSize * 1.8, 0));
  scene.add(centerLabel);
  sceneObjects.push(centerLabel);

  const radiusLabel = createLabel(`r = ${formatNumber(sphere.radius)}`, "label-radius");
  const radiusPosition = new THREE.Vector3(sphere.center.x + sphere.radius, sphere.center.y, sphere.center.z);
  radiusLabel.position.copy(radiusPosition);
  scene.add(radiusLabel);
  sceneObjects.push(radiusLabel);
}

function updateScene() {
  clearSceneObjects();

  const vectors = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  if (vectors.length === 0) {
    setStatus("Füge einen Punkt hinzu, um zu starten.");
    updateEquationDisplay(null);
    return;
  }

  addPoints(vectors);
  fitCameraToPoints(vectors);

  if (vectors.length === 1) {
    setStatus("1 Punkt: einzelner Punkt wird angezeigt.");
    updateEquationDisplay(null);
    return;
  }

  if (vectors.length === 2) {
    addLine(vectors[0], vectors[1]);
    setStatus("2 Punkte: Gerade zwischen den ersten beiden Punkten.");
    updateEquationDisplay(null);
    return;
  }

  if (vectors.length === 3) {
    const circle = computeCircle(vectors);
    if (circle.error) {
      setStatus(circle.error);
      updateEquationDisplay(null);
      return;
    }
    addCircle(circle);
    setStatus("3 Punkte: Kreis durch alle drei Punkte.");
    updateEquationDisplay(null);
    return;
  }

  if (vectors.length >= 4) {
    const sphere = computeSphere(vectors.slice(0, 4));
    if (sphere.error) {
      setStatus(sphere.error);
      updateEquationDisplay(null);
      return;
    }
    addSphere(sphere);
    addSphereAnnotations(sphere);
    updateEquationDisplay(sphere);
    setStatus("4 Punkte: Kugel durch alle vier Punkte.");
  }
}

function setPoints(nextPoints, message) {
  points = nextPoints;
  renderPointList();
  updateScene();
  if (message) {
    setStatus(message);
  }
}

function loadSamplePoints() {
  setPoints([
    { x: -1, y: 1, z: 5 },
    { x: 10, y: 9, z: 2 },
    { x: 7, y: 12, z: -6 },
    { x: -4, y: 1, z: 2 }
  ], "Beispiel-Punkte geladen.");
}

function loadRandomPoints() {
  const range = 3;
  const maxAttempts = 120;

  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const nextPoints = [];
    const used = new Set();

    while (nextPoints.length < MAX_POINTS) {
      const x = randomInt(-range, range);
      const y = randomInt(-range, range);
      const z = randomInt(-range, range);
      const key = `${x},${y},${z}`;
      if (used.has(key)) {
        continue;
      }
      used.add(key);
      nextPoints.push({ x, y, z });
    }

    const vectors = nextPoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const sphere = computeSphere(vectors);
    if (!sphere.error) {
      setPoints(nextPoints, "Zufällige ganzzahlige Punkte geladen.");
      return;
    }
  }

  setStatus("Zufällige Punkte waren koplanar. Bitte erneut versuchen.");
}

function resetView() {
  if (points.length > 0) {
    fitCameraToPoints(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
  } else {
    camera.position.copy(defaultCameraPosition);
    controls.target.copy(defaultTarget);
    controls.update();
  }
  setStatus("Ansicht zurückgesetzt.");
}

function parseNumber(value) {
  if (value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function renderPointList() {
  pointList.innerHTML = "";
  if (points.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Noch keine Punkte.";
    pointList.appendChild(empty);
  } else {
    points.forEach((point, index) => {
      const row = document.createElement("div");
      row.className = "point-row";
      row.innerHTML = `
        <div class="badge">P${index + 1}</div>
        <input type="number" step="any" data-index="${index}" data-axis="x" value="${point.x}" />
        <input type="number" step="any" data-index="${index}" data-axis="y" value="${point.y}" />
        <input type="number" step="any" data-index="${index}" data-axis="z" value="${point.z}" />
      `;
      pointList.appendChild(row);
    });
  }

  addButton.disabled = points.length >= MAX_POINTS;
  removeButton.disabled = points.length === 0;
  clearButton.disabled = points.length === 0;
}

function addPointFromInputs() {
  const x = parseNumber(inputX.value.trim());
  const y = parseNumber(inputY.value.trim());
  const z = parseNumber(inputZ.value.trim());

  if (x === null || y === null || z === null) {
    setStatus("Bitte numerische Werte für X, Y und Z eingeben.");
    return;
  }

  if (points.length >= MAX_POINTS) {
    setStatus("Für diese Konstruktion sind nur vier Punkte erlaubt.");
    return;
  }

  points.push({ x, y, z });
  renderPointList();
  updateScene();
  inputX.value = "";
  inputY.value = "";
  inputZ.value = "";
  inputX.focus();
}

function removeLastPoint() {
  if (points.length === 0) {
    return;
  }
  points.pop();
  renderPointList();
  updateScene();
}

function clearAllPoints() {
  points = [];
  renderPointList();
  updateScene();
}

pointList.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  const index = Number(target.dataset.index);
  const axis = target.dataset.axis;
  const value = parseNumber(target.value.trim());
  if (Number.isNaN(index) || !axis) {
    return;
  }

  if (value === null) {
    target.classList.add("invalid");
    setStatus("Alle Punktkoordinaten müssen numerisch sein.");
    return;
  }

  target.classList.remove("invalid");
  points[index][axis] = value;
  updateScene();
});

addButton.addEventListener("click", addPointFromInputs);
removeButton.addEventListener("click", removeLastPoint);
clearButton.addEventListener("click", clearAllPoints);
sampleButton.addEventListener("click", loadSamplePoints);
randomButton.addEventListener("click", loadRandomPoints);
resetViewButton.addEventListener("click", resetView);
copyStandardButton.addEventListener("click", () => {
  copyText(equationStandard.textContent, "Standardform kopiert.");
});
copyGeneralButton.addEventListener("click", () => {
  copyText(equationGeneral.textContent, "Ausgeschriebene Form kopiert.");
});

[inputX, inputY, inputZ].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      addPointFromInputs();
    }
  });
});

function onResize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) {
    return;
  }
  renderer.setSize(width, height, false);
  labelRenderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", onResize);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(animate);
}

renderPointList();
updateScene();
animate();
