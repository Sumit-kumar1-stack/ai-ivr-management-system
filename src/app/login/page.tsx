"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";


export default function LoginPage() {
  const router =
    useRouter();

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");


  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/auth/login",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email,
                password,
              }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok
      ) {
        setError(
          result.message ??
          "Login failed"
        );

        return;
      }

      router.push(
        "/dashboard"
      );

      router.refresh();
    } catch {
      setError(
        "Unable to connect to the server"
      );
    } finally {
      setLoading(false);
    }
  }


  return (
    <main
      className="
        min-h-screen
        flex
        items-center
        justify-center
        bg-slate-950
        px-4
      "
    >
      <form
        onSubmit={
          handleSubmit
        }
        className="
          w-full
          max-w-md
          rounded-2xl
          border
          border-white/10
          bg-white/5
          p-8
          shadow-2xl
          backdrop-blur-xl
        "
      >
        <h1
          className="
            text-3xl
            font-bold
            text-white
          "
        >
          AI IVR Login
        </h1>

        <p
          className="
            mt-2
            text-sm
            text-slate-400
          "
        >
          Sign in to access the dashboard.
        </p>

        <div
          className="
            mt-8
            space-y-5
          "
        >
          <div>
            <label
              htmlFor="email"
              className="
                mb-2
                block
                text-sm
                text-slate-300
              "
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={
                email
              }
              onChange={
                event =>
                  setEmail(
                    event.target.value
                  )
              }
              required
              autoComplete="email"
              placeholder="admin@example.com"
              className="
                w-full
                rounded-xl
                border
                border-white/10
                bg-black/20
                px-4
                py-3
                text-white
                outline-none
                focus:border-blue-500
              "
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="
                mb-2
                block
                text-sm
                text-slate-300
              "
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={
                password
              }
              onChange={
                event =>
                  setPassword(
                    event.target.value
                  )
              }
              required
              autoComplete="current-password"
              placeholder="Enter password"
              className="
                w-full
                rounded-xl
                border
                border-white/10
                bg-black/20
                px-4
                py-3
                text-white
                outline-none
                focus:border-blue-500
              "
            />
          </div>

          {error && (
            <p
              className="
                rounded-lg
                bg-red-500/10
                px-4
                py-3
                text-sm
                text-red-400
              "
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={
              loading
            }
            className="
              w-full
              rounded-xl
              bg-blue-600
              px-4
              py-3
              font-semibold
              text-white
              transition
              hover:bg-blue-500
              disabled:cursor-not-allowed
              disabled:opacity-60
            "
          >
            {loading
              ? "Signing in..."
              : "Login"}
          </button>
        </div>
      </form>
    </main>
  );
}