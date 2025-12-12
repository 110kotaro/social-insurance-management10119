import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { InsuranceRateTableService } from '../../../../core/services/insurance-rate-table.service';
import { InsuranceRateTable } from '../../../../core/models/insurance-rate-table.model';

export interface InsuranceRateTableEditDialogData {
  rateTable: InsuranceRateTable | null;
  organizationId: string | null;
}

@Component({
  selector: 'app-insurance-rate-table-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule
  ],
  templateUrl: './insurance-rate-table-edit-dialog.component.html',
  styleUrl: './insurance-rate-table-edit-dialog.component.css'
})
export class InsuranceRateTableEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private snackBar = inject(MatSnackBar);

  rateTableForm: FormGroup;
  isEditMode = false;

  constructor(
    public dialogRef: MatDialogRef<InsuranceRateTableEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InsuranceRateTableEditDialogData
  ) {
    this.rateTableForm = this.fb.group({
      grade: [null, [Validators.required, Validators.min(1)]],
      pensionGrade: [null],
      standardRewardAmount: [null, [Validators.required, Validators.min(0)]],
      minAmount: [0, [Validators.required, Validators.min(0)]],
      maxAmount: [null, [Validators.required, Validators.min(0)]],
      effectiveFrom: [null, [Validators.required]],
      effectiveTo: [null],
      // 健保（介護なし）
      healthInsuranceWithoutCareRate: [null, [Validators.required, Validators.min(0)]],
      healthInsuranceWithoutCareTotal: [null, [Validators.required, Validators.min(0)]],
      healthInsuranceWithoutCareHalf: [null, [Validators.required, Validators.min(0)]],
      // 健保（介護あり）
      healthInsuranceWithCareRate: [null, [Validators.required, Validators.min(0)]],
      healthInsuranceWithCareTotal: [null, [Validators.required, Validators.min(0)]],
      healthInsuranceWithCareHalf: [null, [Validators.required, Validators.min(0)]],
      // 厚生年金
      pensionInsuranceRate: [null, [Validators.required, Validators.min(0)]],
      pensionInsuranceTotal: [null, [Validators.required, Validators.min(0)]],
      pensionInsuranceHalf: [null, [Validators.required, Validators.min(0)]]
    });
  }

  ngOnInit(): void {
    if (this.data.rateTable) {
      this.isEditMode = true;
      const table = this.data.rateTable;
      this.rateTableForm.patchValue({
        grade: table.grade,
        pensionGrade: table.pensionGrade ?? null,
        standardRewardAmount: table.standardRewardAmount,
        minAmount: table.minAmount,
        maxAmount: table.maxAmount,
        effectiveFrom: table.effectiveFrom,
        effectiveTo: table.effectiveTo ?? null,
        healthInsuranceWithoutCareRate: table.healthInsuranceWithoutCare.rate,
        healthInsuranceWithoutCareTotal: table.healthInsuranceWithoutCare.total,
        healthInsuranceWithoutCareHalf: table.healthInsuranceWithoutCare.half,
        healthInsuranceWithCareRate: table.healthInsuranceWithCare.rate,
        healthInsuranceWithCareTotal: table.healthInsuranceWithCare.total,
        healthInsuranceWithCareHalf: table.healthInsuranceWithCare.half,
        pensionInsuranceRate: table.pensionInsurance.rate,
        pensionInsuranceTotal: table.pensionInsurance.total,
        pensionInsuranceHalf: table.pensionInsurance.half
      });
    }
  }

  async save(): Promise<void> {
    if (this.rateTableForm.invalid) {
      return;
    }

    const formValue = this.rateTableForm.value;
    const rateTable: Omit<InsuranceRateTable, 'id' | 'createdAt' | 'updatedAt'> = {
      grade: formValue.grade,
      pensionGrade: formValue.pensionGrade || null,
      standardRewardAmount: formValue.standardRewardAmount,
      minAmount: formValue.minAmount,
      maxAmount: formValue.maxAmount,
      effectiveFrom: formValue.effectiveFrom,
      effectiveTo: formValue.effectiveTo || null,
      organizationId: this.data.organizationId,
      healthInsuranceWithoutCare: {
        rate: formValue.healthInsuranceWithoutCareRate,
        total: formValue.healthInsuranceWithoutCareTotal,
        half: formValue.healthInsuranceWithoutCareHalf
      },
      healthInsuranceWithCare: {
        rate: formValue.healthInsuranceWithCareRate,
        total: formValue.healthInsuranceWithCareTotal,
        half: formValue.healthInsuranceWithCareHalf
      },
      pensionInsurance: {
        rate: formValue.pensionInsuranceRate,
        total: formValue.pensionInsuranceTotal,
        half: formValue.pensionInsuranceHalf
      }
    };

    try {
      if (this.isEditMode && this.data.rateTable?.id) {
        await this.insuranceRateTableService.updateRateTable(this.data.rateTable.id, rateTable);
        this.snackBar.open('保険料率テーブルを更新しました', '閉じる', { duration: 3000 });
      } else {
        await this.insuranceRateTableService.createRateTable(rateTable);
        this.snackBar.open('保険料率テーブルを作成しました', '閉じる', { duration: 3000 });
      }
      this.dialogRef.close(true);
    } catch (error) {
      console.error('保険料率テーブルの保存に失敗しました:', error);
      this.snackBar.open('保険料率テーブルの保存に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}

