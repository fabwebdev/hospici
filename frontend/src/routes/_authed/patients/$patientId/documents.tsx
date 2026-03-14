// routes/_authed/patients/$patientId/documents.tsx
// Patient Documents tab — clinical documents, consent forms, certifications

import { getDocumentsFn } from "@/functions/documents.functions.js";
import type { DocumentListResponse, DocumentResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId/documents")({
  component: PatientDocumentsPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  CERTIFICATION: "Certification",
  CONSENT: "Consent Form",
  CLINICAL_NOTE: "Clinical Note",
  ORDER: "Order",
  CARE_PLAN: "Care Plan",
  ADVANCE_DIRECTIVE: "Advance Directive",
  OTHER: "Other",
};

const CATEGORY_BADGE: Record<string, string> = {
  CERTIFICATION: "bg-blue-100 text-blue-800",
  CONSENT: "bg-green-100 text-green-800",
  CLINICAL_NOTE: "bg-gray-100 text-gray-700",
  ORDER: "bg-orange-100 text-orange-800",
  CARE_PLAN: "bg-purple-100 text-purple-800",
  ADVANCE_DIRECTIVE: "bg-red-100 text-red-800",
  OTHER: "bg-gray-100 text-gray-600",
};

function DocumentRow({ doc }: { doc: DocumentResponse }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-base">📄</span>
          <span className="text-sm font-medium text-gray-900">{doc.name}</span>
        </div>
      </td>
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_BADGE[doc.category] ?? "bg-gray-100 text-gray-700"}`}
        >
          {CATEGORY_LABEL[doc.category] ?? doc.category}
        </span>
      </td>
      <td className="py-3 px-4 text-xs text-gray-500">
        {new Date(doc.createdAt).toLocaleDateString()}
      </td>
      <td className="py-3 px-4 text-xs text-gray-400">
        {doc.sizeBytes ? `${Math.round(doc.sizeBytes / 1024)} KB` : "—"}
      </td>
      <td className="py-3 px-4">
        {doc.signed ? (
          <span className="text-xs font-medium text-green-700">✓ Signed</span>
        ) : (
          <span className="text-xs font-medium text-amber-600">Pending signature</span>
        )}
      </td>
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${doc.status === "ACTIVE" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
        >
          {doc.status === "ACTIVE" ? "Active" : "Archived"}
        </span>
      </td>
    </tr>
  );
}

function PatientDocumentsPage() {
  const { patientId } = Route.useParams();

  const { data, isLoading } = useQuery<DocumentListResponse>({
    queryKey: ["documents", patientId],
    queryFn: () => getDocumentsFn({ data: { patientId } }),
  });

  const docs = data?.documents ?? [];
  const pendingSig = docs.filter((d) => !d.signed && d.status === "ACTIVE").length;

  return (
    <div className="p-6 space-y-6">
      {!isLoading && pendingSig > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <span className="text-amber-500 text-lg">✍</span>
          <p className="text-sm font-medium text-amber-800">
            {pendingSig} document{pendingSig !== 1 ? "s" : ""} pending physician signature
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Patient Documents</h2>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} documents on file</p>
        </div>
        <button
          type="button"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
          disabled
          title="Upload coming soon"
        >
          + Upload Document
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500 text-sm">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">No documents on file.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Document
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Size
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Signature
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
