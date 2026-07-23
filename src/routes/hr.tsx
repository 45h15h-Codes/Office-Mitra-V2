import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useStore, type Employee, ROLE_LABEL } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Award, Download, Printer } from "lucide-react";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/hr")({ component: HRPage });

type DocKind = "offer" | "bond";

function HRPage() {
  const { state } = useStore();
  const [kind, setKind] = useState<DocKind>("offer");
  const [empId, setEmpId] = useState<string>(state.employees[0]?.id ?? "");
  const [company, setCompany] = useState("OmERP Technologies Pvt. Ltd.");
  const [bondDuration, setBondDuration] = useState("24");
  const [bondPenalty, setBondPenalty] = useState("150000");
  const [customClauses, setCustomClauses] = useState("Standard confidentiality and non-solicitation terms apply for the duration of the bond.");
  const [rangePreset, setRangePreset] = useState<"current" | "3m" | "6m" | "1y" | "custom">("current");
  const [customFrom, setCustomFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10));

  const employee = state.employees.find((e) => e.id === empId) ?? null;
  const dept = employee ? state.departments.find((d) => d.id === employee.departmentId) : null;
  const head = dept?.headId ? state.employees.find((e) => e.id === dept.headId) : null;

  const generatePDF = () => {
    if (!employee) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const W = 612;
    const marginX = 60;
    let y = 70;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(company, W / 2, y, { align: "center" });
    y += 24;
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(kind === "offer" ? "OFFER OF EMPLOYMENT" : "EMPLOYMENT BOND AGREEMENT", W / 2, y, { align: "center" });
    y += 30;
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, marginX, y);
    y += 24;
    doc.setFont("helvetica", "bold");
    doc.text(`To: ${employee.name}`, marginX, y); y += 14;
    doc.setFont("helvetica", "normal");
    doc.text(employee.address || "—", marginX, y); y += 14;
    doc.text(employee.email, marginX, y); y += 28;

    const body = kind === "offer" ? offerBody(employee, dept?.name, head?.name, company)
                                  : bondBody(employee, company, bondDuration, bondPenalty, customClauses);
    doc.setFontSize(11);
    body.forEach((para) => {
      const lines = doc.splitTextToSize(para, W - marginX * 2);
      if (y + lines.length * 14 > 740) { doc.addPage(); y = 70; }
      doc.text(lines, marginX, y);
      y += lines.length * 14 + 8;
    });

    // Signature block
    if (y > 640) { doc.addPage(); y = 70; }
    y += 30;
    doc.text("_______________________________", marginX, y);
    doc.text("_______________________________", W - marginX - 200, y);
    y += 14;
    doc.setFont("helvetica", "bold");
    doc.text("Authorized Signatory", marginX, y);
    doc.text(employee.name, W - marginX - 200, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(company, marginX, y);
    doc.text("Employee", W - marginX - 200, y);

    doc.save(`${kind === "offer" ? "OfferLetter" : "CompanyBond"}_${employee.name.replace(/\s+/g, "_")}.pdf`);
  };

  const printDoc = () => {
    if (!employee) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const body = kind === "offer" ? offerBody(employee, dept?.name, head?.name, company)
                                  : bondBody(employee, company, bondDuration, bondPenalty, customClauses);
    w.document.write(`<html><head><title>${kind === "offer" ? "Offer Letter" : "Company Bond"}</title>
      <style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:20px;color:#111;line-height:1.6}h1{text-align:center}h2{text-align:center;font-weight:400;letter-spacing:2px}p{white-space:pre-wrap}.sig{margin-top:60px;display:flex;justify-content:space-between}</style>
      </head><body><h1>${company}</h1><h2>${kind === "offer" ? "OFFER OF EMPLOYMENT" : "EMPLOYMENT BOND AGREEMENT"}</h2>
      <p>Date: ${new Date().toLocaleDateString()}</p><p><strong>To:</strong> ${employee.name}<br/>${employee.address || "—"}<br/>${employee.email}</p>
      ${body.map((p) => `<p>${p}</p>`).join("")}
      <div class="sig"><div>_______________________<br/><strong>Authorized Signatory</strong><br/>${company}</div><div>_______________________<br/><strong>${employee.name}</strong><br/>Employee</div></div>
      <script>window.print();</script></body></html>`);
    w.document.close();
  };

  const exportExcel = () => {
    const { from, to } = computeRange(rangePreset, customFrom, customTo);
    const rangeLabel = `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`;
    const wb = XLSX.utils.book_new();

    // Profiles sheet
    const profiles = state.employees.map((e) => {
      const d = state.departments.find((dd) => dd.id === e.departmentId);
      const h = d?.headId ? state.employees.find((x) => x.id === d.headId) : null;
      return {
        "Employee ID": e.id, Name: e.name, Email: e.email, Phone: e.phone,
        Designation: e.designation, Department: d?.name ?? "—",
        "Department Head": h?.name ?? "—", Role: ROLE_LABEL[e.role],
        "Joining Date": new Date(e.joiningDate).toLocaleDateString(),
        Salary: e.salary, Status: e.status, Address: e.address,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profiles), "Profiles");

    // Attendance mock
    const attendance = state.employees.flatMap((e) => Array.from({ length: 10 }).map((_, i) => ({
      Employee: e.name, Date: new Date(Date.now() - i * 86400000).toLocaleDateString(),
      "Check-in": "09:" + String(Math.floor(Math.random() * 30) + 10),
      "Check-out": "18:" + String(Math.floor(Math.random() * 40) + 10),
      "Hours worked": (8 + Math.random()).toFixed(2),
      Status: Math.random() > 0.9 ? "Late" : "On time",
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendance), "Attendance");

    // Leaves mock
    const leaves = state.employees.slice(0, 6).map((e) => ({
      Employee: e.name, Type: ["Casual", "Sick", "Earned"][Math.floor(Math.random() * 3)],
      From: new Date(Date.now() - Math.random() * 30 * 86400000).toLocaleDateString(),
      To: new Date(Date.now() - Math.random() * 10 * 86400000).toLocaleDateString(),
      Days: Math.floor(Math.random() * 5) + 1, Status: "Approved",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leaves), "Leaves");

    // Productivity
    const productivity = state.employees.map((e) => ({
      Employee: e.name,
      "Tracked hours": (140 + Math.random() * 40).toFixed(1),
      "Productive %": (60 + Math.random() * 35).toFixed(1),
      "Idle %": (Math.random() * 15).toFixed(1),
      "Late arrivals": Math.floor(Math.random() * 5),
      Overtime: (Math.random() * 12).toFixed(1),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productivity), "Productivity");

    // Tasks
    const tasks = state.tasks.map((t) => {
      const a = state.employees.find((e) => e.id === t.assigneeId);
      const d = state.departments.find((dd) => dd.id === t.departmentId);
      return { Title: t.title, Stage: t.stage, Priority: t.priority, Assignee: a?.name ?? "—", Department: d?.name ?? "—", "Due date": new Date(t.dueDate).toLocaleDateString() };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tasks), "Tasks");

    // Documents metadata
    const documents = state.employees.flatMap((e) => e.documents.map((d) => ({
      Employee: e.name, Document: d.name, Type: d.type, Version: d.version, "Uploaded at": new Date(d.uploadedAt).toLocaleDateString(),
    })));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(documents), "Documents");

    // Summary sheet
    const summary = [
      { Metric: "Report generated", Value: new Date().toLocaleString() },
      { Metric: "Range", Value: rangeLabel },
      { Metric: "Total employees", Value: state.employees.length },
      { Metric: "Departments", Value: state.departments.length },
      { Metric: "Active tasks", Value: state.tasks.filter((t) => t.stage !== "completed").length },
      { Metric: "Completed tasks", Value: state.tasks.filter((t) => t.stage === "completed").length },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");

    XLSX.writeFile(wb, `OmERP_Report_${rangePreset}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">HR</div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">HR Console</h1>
        <p className="text-sm text-muted-foreground">Generate offer letters, company bonds, and export full workforce reports.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">{kind === "offer" ? <FileText className="h-4 w-4" /> : <Award className="h-4 w-4" />} Document generator</CardTitle>
              <div className="flex rounded-md border overflow-hidden text-xs">
                {(["offer", "bond"] as DocKind[]).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={`px-3 h-8 ${kind === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
                    {k === "offer" ? "Offer Letter" : "Company Bond"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div><Label className="text-xs">Employee</Label>
              <Select value={empId} onValueChange={setEmpId}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{state.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} — {e.designation}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs">Company name</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
            {kind === "bond" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Bond duration (months)</Label><Input type="number" value={bondDuration} onChange={(e) => setBondDuration(e.target.value)} /></div>
                  <div><Label className="text-xs">Penalty amount</Label><Input type="number" value={bondPenalty} onChange={(e) => setBondPenalty(e.target.value)} /></div>
                </div>
                <div><Label className="text-xs">Custom clauses</Label><Textarea rows={3} value={customClauses} onChange={(e) => setCustomClauses(e.target.value)} /></div>
              </>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={generatePDF} className="gap-1" disabled={!employee}><Download className="h-3.5 w-3.5" /> Download PDF</Button>
              <Button variant="outline" onClick={printDoc} className="gap-1" disabled={!employee}><Printer className="h-3.5 w-3.5" /> Print</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Live preview</CardTitle></CardHeader>
          <CardContent>
            <div className="border rounded-md bg-white text-black p-6 text-xs font-serif max-h-[520px] overflow-auto">
              <div className="text-center font-bold text-base">{company}</div>
              <div className="text-center tracking-[0.2em] text-[10px] mt-1">{kind === "offer" ? "OFFER OF EMPLOYMENT" : "EMPLOYMENT BOND AGREEMENT"}</div>
              <div className="mt-4">Date: {new Date().toLocaleDateString()}</div>
              {employee ? (
                <>
                  <div className="mt-3"><strong>To:</strong> {employee.name}<br />{employee.address || "—"}<br />{employee.email}</div>
                  {(kind === "offer" ? offerBody(employee, dept?.name, head?.name, company) : bondBody(employee, company, bondDuration, bondPenalty, customClauses)).map((p, i) => (
                    <p key={i} className="mt-3 whitespace-pre-wrap">{p}</p>
                  ))}
                </>
              ) : <div className="text-muted-foreground">Select an employee.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Employee reports · Excel export</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Multi-sheet .xlsx with profiles, attendance, leaves, productivity, tasks, documents, and summary.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56"><Label className="text-xs">Date range</Label>
              <Select value={rangePreset} onValueChange={(v) => setRangePreset(v as typeof rangePreset)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="current">Current month</SelectItem>
                <SelectItem value="3m">Last 3 months</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="1y">Last 1 year</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent></Select>
            </div>
            {rangePreset === "custom" && (
              <>
                <div><Label className="text-xs">From</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></div>
                <div><Label className="text-xs">To</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></div>
              </>
            )}
            <Button onClick={exportExcel} className="gap-1"><Download className="h-3.5 w-3.5" /> Export .xlsx</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function offerBody(e: Employee, dept: string | undefined, head: string | undefined, company: string): string[] {
  const start = new Date(e.joiningDate).toLocaleDateString();
  return [
    `Dear ${e.name},`,
    `We are pleased to offer you the position of ${e.designation} at ${company}. This letter confirms the terms of your engagement, as agreed between yourself and the company.`,
    `Your employment will commence on ${start} and will be subject to the terms and conditions outlined in this letter and any accompanying documents.`,
    `You will be assigned to the ${dept ?? "—"} department, reporting to ${head ?? "your reporting manager"}. Your role will focus on the responsibilities communicated during the interview process, and may evolve as the company grows.`,
    `Your annual compensation is $${e.salary.toLocaleString()}, payable in accordance with the company's standard payroll schedule. You will also be eligible for benefits and leaves as per company policy.`,
    `This offer is contingent upon satisfactory completion of background checks and verification of the documents you have provided. By signing below, you acknowledge acceptance of the terms of this offer.`,
    `We look forward to welcoming you to ${company} and are confident that you will make a significant contribution to our team.`,
    `Sincerely,\nHuman Resources — ${company}`,
  ];
}

function bondBody(e: Employee, company: string, duration: string, penalty: string, custom: string): string[] {
  return [
    `This Employment Bond Agreement (the "Agreement") is entered into on ${new Date().toLocaleDateString()} between ${company} (the "Company") and ${e.name}, currently employed as ${e.designation} (the "Employee").`,
    `1. TERM. The Employee agrees to remain in the continuous service of the Company for a period of ${duration} months from the date of joining (${new Date(e.joiningDate).toLocaleDateString()}). During this period, the Employee shall not resign without providing appropriate notice as per company policy.`,
    `2. TRAINING & INVESTMENT. The Company has invested in the Employee's training, onboarding, and role-specific enablement. In consideration of this investment, the Employee agrees to fulfill the term outlined in Clause 1.`,
    `3. BREACH & PENALTY. If the Employee resigns before completing the bond term, or if employment is terminated by the Company for misconduct or breach of policies, the Employee shall pay the Company an amount of $${Number(penalty).toLocaleString()} as compensation towards recovered training and administrative costs.`,
    `4. CONFIDENTIALITY. The Employee shall keep confidential all trade secrets, proprietary information, client data, and business processes of the Company both during and after employment.`,
    `5. GOVERNING LAW. This Agreement shall be governed by and construed in accordance with the applicable laws of the jurisdiction in which the Company is registered.`,
    `6. ADDITIONAL CLAUSES. ${custom}`,
    `By signing below, both parties confirm that they have read, understood, and agreed to be bound by the terms of this Agreement.`,
  ];
}

function computeRange(preset: string, from: string, to: string): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "current") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (preset === "3m") return { from: new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()), to: now };
  if (preset === "6m") return { from: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()), to: now };
  if (preset === "1y") return { from: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), to: now };
  return { from: new Date(from), to: new Date(to) };
}
