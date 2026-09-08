// Shim for the `server-only` package. In the RSC world it throws if imported into
// a client bundle; here it's a harmless no-op so a defensively-pulled module can't
// break the native build. (The client editor graph does not import it.)
export {};
