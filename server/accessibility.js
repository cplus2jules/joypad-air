// Chequeo del permiso de Accesibilidad de macOS.
//
// CGEventPost (lo que usa nut-js por debajo) NO lanza error sin permiso:
// descarta los eventos en silencio. Por eso el chequeo debe ser activo.
//
// Vía primaria: @nut-tree-fork/node-mac-permissions (viene precompilado como
// dependencia de libnut-darwin) — getAuthStatus("accessibility") responde
// sin tocar el teclado ni disparar prompts de Automation.
// Fallback: osascript "key code 90" (F20, tecla inocua que nada usa); sin
// permiso falla con error 1002. Nota: la primera vez puede pedir el permiso
// de Automation sobre System Events (prompt único, inofensivo).
//
// El permiso TCC se atribuye al "responsible process" (Terminal / Play.app),
// que es el mismo para node y para sus hijos — el resultado refleja el
// permiso efectivo del server.

import { execFile } from "node:child_process";

let cached = "unknown"; // true | false | "unknown"

async function viaNodeMacPermissions() {
  const mod = await import("@nut-tree-fork/node-mac-permissions");
  const api = mod.default ?? mod;
  const status = api.getAuthStatus("accessibility");
  return status === "authorized";
}

function viaOsascript() {
  return new Promise((resolve) => {
    execFile(
      "osascript",
      ["-e", 'tell application "System Events" to key code 90'],
      { timeout: 3000 },
      (err) => resolve(!err)
    );
  });
}

export async function checkAccessibility() {
  try {
    cached = await viaNodeMacPermissions();
  } catch {
    try {
      cached = await viaOsascript();
    } catch {
      cached = "unknown";
    }
  }
  return cached;
}

export function accessibilityStatus() {
  return cached;
}

// Pre-inserta la app en la lista de Accesibilidad (aparece desmarcada) y
// abre el panel correcto de Ajustes del Sistema. Para el onboarding guiado.
export async function requestAccessibility() {
  try {
    const mod = await import("@nut-tree-fork/node-mac-permissions");
    const api = mod.default ?? mod;
    api.askForAccessibilityAccess?.();
  } catch {
    // sin el módulo, al menos abrir el panel
  }
  execFile("open", [
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  ]);
}

export function printAccessibilityHelp() {
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log("│  ⚠️  FALTA EL PERMISO DE ACCESIBILIDAD                       │");
  console.log("│                                                             │");
  console.log("│  Sin él, las teclas NO llegan a Ryujinx (fallan en          │");
  console.log("│  silencio). Para arreglarlo:                                │");
  console.log("│                                                             │");
  console.log("│  Ajustes del Sistema → Privacidad y seguridad →             │");
  console.log("│  Accesibilidad → activa la casilla de Terminal              │");
  console.log("│  (o de Play, si arrancaste con Play.app)                    │");
  console.log("│                                                             │");
  console.log("│  Luego vuelve a lanzar el servidor.                         │");
  console.log("└─────────────────────────────────────────────────────────────┘");
  console.log("");
}
