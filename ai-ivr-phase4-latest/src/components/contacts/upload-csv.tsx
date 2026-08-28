"use client";

import {
  ChangeEvent,
  useRef,
  useState,
} from "react";

import {
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";

import {
  Button,
} from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  useImportContacts,
} from "@/features/contacts/use-import-contacts";

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

export default function UploadCSV() {
  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null
    );

  const [
    validationError,
    setValidationError,
  ] =
    useState<string | null>(
      null
    );

  const fileInputRef =
    useRef<HTMLInputElement>(
      null
    );

  const mutation =
    useImportContacts();

  function resetForm(): void {
    setFile(
      null
    );

    setValidationError(
      null
    );

    if (
      fileInputRef.current
    ) {
      fileInputRef.current.value =
        "";
    }
  }

  function handleFileChange(
    event:
      ChangeEvent<HTMLInputElement>
  ): void {
    const selectedFile =
      event.target.files?.[0];

    setValidationError(
      null
    );

    if (
      !selectedFile
    ) {
      setFile(
        null
      );

      return;
    }

    const isCsvFile =
      selectedFile.type ===
        "text/csv" ||
      selectedFile.name
        .toLowerCase()
        .endsWith(
          ".csv"
        );

    if (
      !isCsvFile
    ) {
      setFile(
        null
      );

      setValidationError(
        "Please select a valid CSV file."
      );

      event.target.value =
        "";

      return;
    }

    if (
      selectedFile.size >
      MAX_FILE_SIZE
    ) {
      setFile(
        null
      );

      setValidationError(
        "CSV file must be smaller than 5 MB."
      );

      event.target.value =
        "";

      return;
    }

    setFile(
      selectedFile
    );
  }

  function handleUpload(): void {
    if (
      !file ||
      mutation.isPending
    ) {
      return;
    }

    mutation.mutate(
      file,
      {
        onSuccess: () => {
          resetForm();

          setOpen(
            false
          );
        },
      }
    );
  }

  function handleOpenChange(
    nextOpen: boolean
  ): void {
    setOpen(
      nextOpen
    );

    if (
      !nextOpen &&
      !mutation.isPending
    ) {
      resetForm();
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={
          () =>
            setOpen(
              true
            )
        }
      >
        <Upload
          className="
            mr-2
            h-4
            w-4
          "
        />

        Upload CSV
      </Button>

      <Dialog
        open={
          open
        }
        onOpenChange={
          handleOpenChange
        }
      >
        <DialogContent
          className="
            sm:max-w-lg
          "
        >
          <DialogHeader>
            <DialogTitle>
              Import contacts
            </DialogTitle>

            <DialogDescription>
              Upload a CSV file containing your contact records.
            </DialogDescription>
          </DialogHeader>

          <div
            className="
              space-y-4
              py-2
            "
          >
            <button
              type="button"
              disabled={
                mutation.isPending
              }
              onClick={
                () =>
                  fileInputRef.current
                    ?.click()
              }
              className="
                flex
                min-h-44
                w-full
                flex-col
                items-center
                justify-center
                rounded-xl
                border
                border-dashed
                bg-muted/20
                p-6
                text-center
                transition-colors
                hover:bg-muted/40
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >
              <FileSpreadsheet
                className="
                  mb-3
                  h-10
                  w-10
                  text-muted-foreground
                "
              />

              <p
                className="
                  text-sm
                  font-semibold
                "
              >
                Select CSV file
              </p>

              <p
                className="
                  mt-1
                  text-xs
                  text-muted-foreground
                "
              >
                Maximum size: 5 MB
              </p>
            </button>

            <input
              ref={
                fileInputRef
              }
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={
                mutation.isPending
              }
              onChange={
                handleFileChange
              }
            />

            {file && (
              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-3
                  rounded-xl
                  border
                  bg-muted/20
                  p-4
                "
              >
                <div
                  className="
                    min-w-0
                  "
                >
                  <p
                    className="
                      truncate
                      text-sm
                      font-medium
                    "
                  >
                    {file.name}
                  </p>

                  <p
                    className="
                      mt-1
                      text-xs
                      text-muted-foreground
                    "
                  >
                    {(
                      file.size /
                      1024
                    ).toFixed(
                      1
                    )}{" "}
                    KB
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={
                    mutation.isPending
                  }
                  onClick={
                    resetForm
                  }
                  aria-label="Remove selected file"
                >
                  <X
                    className="
                      h-4
                      w-4
                    "
                  />
                </Button>
              </div>
            )}

            {validationError && (
              <p
                className="
                  text-sm
                  text-destructive
                "
              >
                {validationError}
              </p>
            )}

            {mutation.isError && (
              <p
                className="
                  text-sm
                  text-destructive
                "
              >
                Failed to import contacts. Check the CSV format and try again.
              </p>
            )}

            {mutation.isSuccess && (
              <p
                className="
                  text-sm
                  text-green-600
                "
              >
                Contacts imported successfully.
              </p>
            )}

            <div
              className="
                rounded-xl
                border
                bg-muted/20
                p-4
              "
            >
              <p
                className="
                  text-sm
                  font-medium
                "
              >
                Recommended CSV columns
              </p>

              <p
                className="
                  mt-2
                  text-xs
                  leading-5
                  text-muted-foreground
                "
              >
                fullName, phone, email, language
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={
                mutation.isPending
              }
              onClick={
                () =>
                  handleOpenChange(
                    false
                  )
              }
            >
              Cancel
            </Button>

            <Button
              type="button"
              disabled={
                !file ||
                mutation.isPending
              }
              onClick={
                handleUpload
              }
            >
              {mutation.isPending
                ? "Importing..."
                : "Import contacts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}