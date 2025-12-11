import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { PremiumDifference } from '../../../core/models/monthly-calculation.model';

export interface RetroactiveDeductionDialogData {
  premiumDifference: PremiumDifference;
  currentYear: number;
  currentMonth: number;
}

export interface RetroactiveDeductionMonth {
  year: number;
  month: number;
  selected: boolean;
}

@Component({
  selector: 'app-retroactive-deduction-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckboxModule,
    MatListModule,
    MatDividerModule
  ],
  templateUrl: './retroactive-deduction-dialog.component.html',
  styleUrl: './retroactive-deduction-dialog.component.css'
})
export class RetroactiveDeductionDialogComponent {
  private dialogRef = inject(MatDialogRef<RetroactiveDeductionDialogComponent>);
  private fb = inject(FormBuilder);
  data = inject<RetroactiveDeductionDialogData>(MAT_DIALOG_DATA);

  months: RetroactiveDeductionMonth[] = [];
  form: FormGroup;

  constructor() {
    // 現在の月から過去12ヶ月分の選択肢を生成
    const currentDate = new Date(this.data.currentYear, this.data.currentMonth - 1, 1);
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      this.months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        selected: i === 0 // デフォルトで現在の月を選択
      });
    }

    this.form = this.fb.group({
      selectedMonths: this.fb.array(
        this.months.map(month => this.fb.control(month.selected))
      )
    });
  }

  get selectedMonthsFormArray(): FormArray {
    return this.form.get('selectedMonths') as FormArray;
  }

  getFormControl(index: number): FormControl {
    return this.selectedMonthsFormArray.at(index) as FormControl;
  }

  get selectedMonths(): RetroactiveDeductionMonth[] {
    const formArray = this.selectedMonthsFormArray;
    return this.months.filter((month, index) => 
      formArray.at(index).value
    );
  }

  formatCurrency(amount: number): string {
    return `¥${amount.toLocaleString()}`;
  }

  cancel(): void {
    this.dialogRef.close();
  }

  confirm(): void {
    const selected = this.selectedMonths;
    if (selected.length === 0) {
      return;
    }
    this.dialogRef.close(selected);
  }
}

