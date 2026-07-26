"use client";

import {
  FormEvent,
} from "react";

import {
  RotateCcw,
  Search,
} from "lucide-react";

import {
  Input,
} from "@/components/ui/input";

import {
  Button,
} from "@/components/ui/button";

interface ContactFiltersProps {
  search: string;
  language: string;
  status: string;
  isLoading?: boolean;

  onSearchChange:
    (
      value: string
    ) => void;

  onLanguageChange:
    (
      value: string
    ) => void;

  onStatusChange:
    (
      value: string
    ) => void;

  onSearch:
    () => void;

  onReset:
    () => void;
}

export default function ContactFilters({
  search,
  language,
  status,
  isLoading = false,
  onSearchChange,
  onLanguageChange,
  onStatusChange,
  onSearch,
  onReset,
}: ContactFiltersProps) {
  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ): void {
    event.preventDefault();

    onSearch();
  }

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="
        flex
        flex-col
        gap-3
        rounded-xl
        border
        bg-card
        p-4
        lg:flex-row
        lg:items-center
      "
    >
      <div
        className="
          relative
          min-w-0
          flex-1
        "
      >
        <Search
          className="
            absolute
            left-3
            top-1/2
            h-4
            w-4
            -translate-y-1/2
            text-muted-foreground
          "
        />

        <Input
          value={
            search
          }
          placeholder="Search by name, phone or email..."
          disabled={
            isLoading
          }
          onChange={
            (
              event
            ) =>
              onSearchChange(
                event.target.value
              )
          }
          className="pl-9"
        />
      </div>

      <select
        value={
          language
        }
        disabled={
          isLoading
        }
        onChange={
          (
            event
          ) =>
            onLanguageChange(
              event.target.value
            )
        }
        className="
          h-10
          rounded-md
          border
          border-input
          bg-background
          px-3
          text-sm
          outline-none
          ring-offset-background
          focus:ring-2
          focus:ring-ring
          disabled:cursor-not-allowed
          disabled:opacity-50
          lg:w-44
        "
      >
        <option value="">
          All Languages
        </option>

        <option value="English">
          English
        </option>

        <option value="Hindi">
          Hindi
        </option>

        <option value="Marathi">
          Marathi
        </option>
      </select>

      <select
        value={
          status
        }
        disabled={
          isLoading
        }
        onChange={
          (
            event
          ) =>
            onStatusChange(
              event.target.value
            )
        }
        className="
          h-10
          rounded-md
          border
          border-input
          bg-background
          px-3
          text-sm
          outline-none
          ring-offset-background
          focus:ring-2
          focus:ring-ring
          disabled:cursor-not-allowed
          disabled:opacity-50
          lg:w-44
        "
      >
        <option value="">
          All Statuses
        </option>

        <option value="PENDING">
          Pending
        </option>

        <option value="CALLED">
          Called
        </option>

        <option value="ANSWERED">
          Answered
        </option>

        <option value="FAILED">
          Failed
        </option>

        <option value="BLOCKED">
          Blocked
        </option>
      </select>

      <Button
        type="submit"
        disabled={
          isLoading
        }
      >
        <Search
          className="
            mr-2
            h-4
            w-4
          "
        />

        Search
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={
          isLoading
        }
        onClick={
          onReset
        }
      >
        <RotateCcw
          className="
            mr-2
            h-4
            w-4
          "
        />

        Reset
      </Button>
    </form>
  );
}