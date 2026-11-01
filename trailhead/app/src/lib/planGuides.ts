// Guidance for the research step, by kind of trip: where to look, what makes a good option and what to ask the
// place. Practical advice only. Safety rules live in the readiness checks (functions/trailhead_core/plan_checks.py),
// with their sources; nothing here is a rule.
import type { PlanKind } from './plans';

export interface ResearchGuide {
  /** Where troops usually find options of this kind. */
  lookIn: string[];
  /** What separates a good option from a poor one. */
  goodSigns: string[];
  /** Questions to ask the place before choosing it. */
  ask: string[];
}

export const GUIDES: Record<PlanKind, ResearchGuide> = {
  campout: {
    lookIn: [
      'Your council\'s camps, which often keep sites for Scout units',
      'State parks with group or youth campsites',
      'National forest and other public land campgrounds',
      'Places your troop has been before (below)',
    ],
    goodSigns: [
      'A group site that fits everyone, so patrols can camp near each other',
      'Water and toilets close by, or a plan to bring water',
      'Something to do: trails, water, a skill the Scouts want to work on',
      'Somewhere to go in bad weather',
      'A drive short enough to arrive with daylight to set up',
    ],
    ask: [
      'How far ahead do group sites open for booking, and how do we book?',
      'How many people and tents fit, and is there a fee per person or per site?',
      'Are campfires allowed now? Any burn bans?',
      'Is there drinking water, and is it on in this season?',
      'Where do we park, and how far is it to carry gear?',
      'Who do we call on site, and where is the nearest hospital?',
    ],
  },
  service: {
    lookIn: [
      'Your chartered organization, school or place of worship',
      'Food banks, parks departments and animal shelters near you',
      'Your city or county volunteer office',
      'Groups your troop has helped before (below)',
    ],
    goodSigns: [
      'Work Scouts of every age can do, with a clear way to see what got done',
      'A named contact who will be there on the day',
      'Tools and supplies sorted out ahead: theirs or ours',
      'A length that fits the day, so Scouts finish what they start',
    ],
    ask: [
      'What exactly will the Scouts do, and is there a minimum age for any of it?',
      'How many helpers can you use, and for how long?',
      'Do you provide tools, gloves and safety gear, or should we bring them?',
      'Is there a waiver or sign-in sheet for each person?',
      'Where do we meet, park and find a restroom?',
      'Who do we call on the day?',
    ],
  },
  highAdventure: {
    lookIn: [
      'The national high adventure bases, which open bookings well ahead of each season',
      'Your council\'s own high adventure programs',
      'A trek your troop plans itself, on public land, with permits',
    ],
    goodSigns: [
      'Ages and fitness that match your crew, with time to train',
      'A cost families can plan and fundraise for over a year or more',
      'Enough adults who can go for the whole trip',
      'A booking date you can make, with a backup choice',
    ],
    ask: [
      'When does booking open for our year, and how are spots given out?',
      'What are the crew size, age and adult rules?',
      'What do the deposit and final payment cost, and when are they due?',
      'What medical forms, swim tests or training does each person need?',
      'What gear do you provide, and what do we bring?',
    ],
  },
  other: {
    lookIn: [
      'Ideas from your Scouts at the next PLC',
      'Museums, factories, farms and parks that offer group visits',
      'Places your troop has been before (below)',
    ],
    goodSigns: [
      'Something the Scouts asked for, or that helps them advance',
      'A cost families can manage',
      'A group rate or a guided visit for youth groups',
    ],
    ask: [
      'Do you have group rates, and how many people can come at once?',
      'How far ahead do we need to book?',
      'Is there a minimum age, or anything Scouts should bring or wear?',
      'Who do we call on the day?',
    ],
  },
};
