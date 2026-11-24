"use client";

import { useEffect } from "react";

export function AuthCompleteRedirect() {
  useEffect(() => {
    // Perform a same-origin navigation so browsers attach SameSite=Strict session cookies on GET /
    window.location.replace("/");
  }, []);

  return null;
}
