// Zugangsdaten für die Cloud (Supabase). Leer = die App arbeitet nur lokal im Browser.
// Werte aus dem Supabase-Dashboard: Project Settings → API → „Project URL“ und „anon public“ Key.
// Der anon Key darf öffentlich sein: Wer welche Daten sehen darf, regeln die Sicherheitsregeln
// in supabase/schema.sql. Den „service_role“ Key NIE hier eintragen!
const CLOUD_CONFIG = {
  url: 'https://mqriaxqodbhfxdxgvwlg.supabase.co',   // Projekt „DTF Tools“
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcmlheHFvZGJoZnhkeGd2d2xnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMjY5NDYsImV4cCI6MjEwNjYwMjk0Nn0.JWtyjqAUqKnFtBvX8arQ-iKsX8PYp5hgqwprZ166jCo'
};
