"""Supabase session tokens, verified locally. New Supabase projects sign with asymmetric keys published as a JWKS;
older ones use a shared HS256 secret. Either way the server never sees a password."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt

from .config import Settings


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str
    avatar: str
    provider: str


ANONYMOUS = User("local-dev", "dev@localhost", "Local developer", "", "none")


class Verifier:
    def __init__(self, settings: Settings) -> None:
        self.mode = settings.auth_mode
        self.issuer = f"{settings.supabase_url}/auth/v1" if settings.supabase_url else ""
        self.secret = settings.supabase_jwt_secret
        self.jwks = jwt.PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600) if self.issuer else None

    @property
    def configured(self) -> bool:
        return self.mode == "off" or bool(self.issuer)

    def verify(self, header: str | None) -> User:
        if self.mode == "off":
            return ANONYMOUS
        if not self.issuer:
            raise AuthError("Supabase is not configured on the server (set SUPABASE_URL)")
        if not header or not header.lower().startswith("bearer "):
            raise AuthError("missing bearer token")
        token = header.split(" ", 1)[1].strip()
        try:
            algorithm = jwt.get_unverified_header(token).get("alg", "")
            if algorithm == "HS256":
                if not self.secret:
                    raise AuthError("token uses the legacy HS256 secret; set SUPABASE_JWT_SECRET")
                claims = jwt.decode(token, self.secret, algorithms=["HS256"], audience="authenticated", issuer=self.issuer)
            else:
                key = self.jwks.get_signing_key_from_jwt(token)  # type: ignore[union-attr]
                claims = jwt.decode(token, key.key, algorithms=["ES256", "RS256", "EdDSA"], audience="authenticated", issuer=self.issuer)
        except AuthError:
            raise
        except jwt.PyJWTError as exc:
            raise AuthError(f"invalid session: {exc}") from exc
        return user_from_claims(claims)


def user_from_claims(claims: dict[str, Any]) -> User:
    meta = claims.get("user_metadata") or {}
    app = claims.get("app_metadata") or {}
    return User(
        id=str(claims.get("sub", "")), email=str(claims.get("email", "")),
        name=str(meta.get("full_name") or meta.get("name") or meta.get("user_name") or claims.get("email", "")),
        avatar=str(meta.get("avatar_url") or ""), provider=str(app.get("provider") or ""),
    )
