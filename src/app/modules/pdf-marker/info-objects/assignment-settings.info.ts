import {IRubric} from "@coreModule/utils/rubric.class";

export interface AssignmentSettingsInfo {
  defaultColour: string;
  rubricID?: string;
  rubric?: IRubric;
  isCreated?: boolean; //true if from an lms, imported via import zip, false if created by upload pdf
}
