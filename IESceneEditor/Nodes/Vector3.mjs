// @ts-nocheck

import { nodeRegistry } from "../IENodeRegistry.mjs";

function readFiniteNumber(readInput, name) {
  const value = Number(readInput(name));

  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }

  return value;
}

function readVector3(readInput, name) {
  const value = readInput(name);

  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${name} must be a three-number array`);
  }

  return value;
}

nodeRegistry.register("vector3.compact", {
  name: "Compact Vector 3",
  category: "Vector 3",

  inputs: [
    { name: "x", type: "number", default: 0 },
    { name: "y", type: "number", default: 0 },
    { name: "z", type: "number", default: 0 },
  ],

  outputs: [{ name: "vector", type: "vector3" }],

  evaluate({ readInput }) {
    return [
      Number(readInput("x")),
      Number(readInput("y")),
      Number(readInput("z")),
    ];
  },
});

nodeRegistry.register("vector3.spread", {
  name: "Spread Vector 3",
  category: "Vector 3",

  inputs: [
    {
      name: "vector",
      type: "vector3",
      default: [0, 0, 0],
    },
  ],

  outputs: [
    { name: "x", type: "number" },
    { name: "y", type: "number" },
    { name: "z", type: "number" },
  ],

  evaluate({ readInput, output }) {
    const vector = readInput("vector") ?? [0, 0, 0];

    const values = Array.isArray(vector)
      ? vector
      : [vector.x ?? 0, vector.y ?? 0, vector.z ?? 0];

    switch (output) {
      case "x":
        return Number(values[0]);
      case "y":
        return Number(values[1]);
      case "z":
        return Number(values[2]);
      default:
        return 0;
    }
  },
});

nodeRegistry.register("vector3.fromXZ", {
  name: "Vector 3 From XZ",
  category: "Vector 3",
  inputs: [
    { name: "x", type: "number", default: 0 },
    { name: "z", type: "number", default: 0 },
  ],
  outputs: [{ name: "value", type: "vector3" }],
  evaluate({ readInput }) {
    return [
      readFiniteNumber(readInput, "x"),
      0,
      readFiniteNumber(readInput, "z"),
    ];
  },
});

nodeRegistry.register("vector3.normalize", {
  name: "Normalize Vector 3",
  category: "Vector 3",
  inputs: [{ name: "value", type: "vector3", default: [0, 0, 0] }],
  outputs: [{ name: "result", type: "vector3" }],
  evaluate({ readInput }) {
    const [x, y, z] = readVector3(readInput, "value");
    const length = Math.hypot(x, y, z);

    return length === 0 ? [0, 0, 0] : [x / length, y / length, z / length];
  },
});

nodeRegistry.register("vector3.scale", {
  name: "Scale Vector 3",
  category: "Vector 3",
  inputs: [
    { name: "vector", type: "vector3", default: [0, 0, 0] },
    { name: "scalar", type: "number", default: 1 },
  ],
  outputs: [{ name: "result", type: "vector3" }],
  evaluate({ readInput }) {
    const [x, y, z] = readVector3(readInput, "vector");
    const scalar = readFiniteNumber(readInput, "scalar");

    return [x * scalar, y * scalar, z * scalar];
  },
});
