import { Subject } from "../types";

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'math', name: 'Matematika', icon: 'fa-calculator', color: 'bg-blue-500', description: 'Logické uvažování a řešení problémů.' },
  { id: 'phys', name: 'Fyzika', icon: 'fa-atom', color: 'bg-cyan-500', description: 'Zákony vesmíru a přírodní síly.' },
  { id: 'chem', name: 'Chemie', icon: 'fa-flask-vial', color: 'bg-emerald-500', description: 'Složení látek a jejich reakce.' },
  { id: 'bio', name: 'Biologie', icon: 'fa-dna', color: 'bg-green-500', description: 'Živé organismy a ekosystémy.' },
  { id: 'en', name: 'Angličtina', icon: 'fa-language', color: 'bg-indigo-500', description: 'Světový jazyk a komunikace.' },
  { id: 'de', name: 'Němčina', icon: 'fa-kaaba', color: 'bg-yellow-600', description: 'Německý jazyk a kultura.' },
  { id: 'es', name: 'Španělština', icon: 'fa-bullhorn', color: 'bg-orange-600', description: 'Jazyk mnoha kultur.' },
  { id: 'hist', name: 'Dějepis', icon: 'fa-landmark', color: 'bg-amber-600', description: 'Minulost lidstva a historické souvislosti.' },
  { id: 'info', name: 'Informatika', icon: 'fa-microchip', color: 'bg-purple-500', description: 'Programování a digitální svět.' },
  { id: 'geo', name: 'Zeměpis', icon: 'fa-earth-europe', color: 'bg-orange-500', description: 'Geografie a kultura světa.' },
  { id: 'lit', name: 'Čeština', icon: 'fa-book', color: 'bg-red-500', description: 'Jazyk, literatura a interpretace.' },
  { id: 'soc', name: 'ZSV', icon: 'fa-users', color: 'bg-teal-500', description: 'Společnost a sociální vztahy.' },
];

export const ALL_AVAILABLE_SUBJECTS = DEFAULT_SUBJECTS;
