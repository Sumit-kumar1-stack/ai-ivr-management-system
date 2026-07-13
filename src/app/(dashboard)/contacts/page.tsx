import ContactStats from "@/components/contacts/contact-stats";
import ContactFilters from "@/components/contacts/contact-filters";
import ContactTable from "@/components/contacts/contact-table";
import Pagination from "@/components/contacts/pagination";

import UploadCSV from "@/components/contacts/upload-csv";
import ContactForm from "@/components/contacts/contact-form";

export default function ContactsPage() {
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-3xl font-bold">
            Contacts
          </h1>

          <p className="text-muted-foreground">
            Manage your contact database
          </p>
        </div>

        <div className="flex gap-3">

          {/* Upload CSV Dialog */}
          <UploadCSV />

          {/* Add Contact Dialog */}
          <ContactForm />

        </div>
      </div>

      {/* Statistics */}
      <ContactStats />

      {/* Search & Filters */}
      <ContactFilters />

      {/* Contact Table */}
      <ContactTable />

      {/* Pagination */}
      <Pagination />

    </div>
  );
}