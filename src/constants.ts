import { Subject } from "../types";

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'math', name: 'Matematika', icon: 'fa-calculator', color: 'bg-blue-500', description: 'Logické uvažování a řešení problémů.' },
  { id: 'phys', name: 'Fyzika', icon: 'fa-atom', color: 'bg-cyan-500', description: 'Zákony vesmíru a přírodní síly.' },
  { id: 'chem', name: 'Chemie', icon: 'fa-flask-vial', color: 'bg-emerald-500', description: 'Složení látek a jejich reakce.' },
  { id: 'bio', name: 'Biologie', icon: 'fa-dna', color: 'bg-green-500', description: 'Živé organismy a ekosystémy.' },
  { id: 'hist', name: 'Dějepis', icon: 'fa-landmark', color: 'bg-amber-600', description: 'Minulost lidstva a historické souvislosti.' },
  { id: 'info', name: 'Informatika', icon: 'fa-microchip', color: 'bg-purple-500', description: 'Programování a digitální svět.' },
  { id: 'geo', name: 'Zeměpis', icon: 'fa-earth-europe', color: 'bg-orange-500', description: 'Geografie a kultura světa.' },
  { id: 'lit', name: 'Čeština', icon: 'fa-book', color: 'bg-red-500', description: 'Jazyk, literatura a interpretace.' },
];

export const ALL_AVAILABLE_SUBJECTS = DEFAULT_SUBJECTS;
